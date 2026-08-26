import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import { buildActionEvent, classifyMutationOutcome, createAppendOnlyLedger, serializeError, snapshotState, timeoutError, withTimeout } from "./evidence.mjs";
import {
  assertSafeOperation,
  authenticateIdentity,
  clearActorTokens,
  fetchJson,
  loadAuthConfig,
  STATEFUL_MAX_USERS,
  STATEFUL_PATHS,
} from "./runner.mjs";

const STAGES = Object.freeze([
  { name: "5", count: 5, ranked: 2, casual: 3, fragmented: 0 },
  { name: "10", count: 10, ranked: 4, casual: 6, fragmented: 0 },
  { name: "20", count: 20, ranked: 12, casual: 6, fragmented: 2 },
  { name: "30", count: 30, ranked: 18, casual: 9, fragmented: 3 },
  { name: "40", count: 40, ranked: 24, casual: 12, fragmented: 4 },
  { name: "50", count: 50, ranked: 30, casual: 15, fragmented: 5 },
  { name: "75", count: 75, ranked: 42, casual: 24, fragmented: 9 },
  { name: "100", count: 100, ranked: 60, casual: 30, fragmented: 10 },
  { name: "125", count: 125, ranked: 72, casual: 39, fragmented: 14 },
  { name: "150", count: 150, ranked: 84, casual: 48, fragmented: 18 },
  { name: "200", count: 200, ranked: 114, casual: 66, fragmented: 20 },
  { name: "300", count: 300, ranked: 174, casual: 96, fragmented: 30 },
  { name: "400", count: 400, ranked: 234, casual: 126, fragmented: 40 },
  { name: "500", count: 500, ranked: 294, casual: 156, fragmented: 50 },
]);

const ACTIVE_SESSION_STATES = new Set(["active", "playing", "matched"]);
const TERMINAL_SESSION_STATES = new Set(["completed", "cancelled"]);
export const STATE_POLL_INTERVAL_MS = 2_000;
export const STATE_POLL_JITTER_MS = 250;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const RUNNER_IO_CONCURRENCY = 8;

function safeError(error) {
  return String(error?.message || error || "unknown error")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access[_-]?token|refresh[_-]?token|password|secret)[=:][^\s,}]+/gi, "$1=[REDACTED]");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency(items, concurrency, worker) {
  const values = Array.from(items);
  const results = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Number(concurrency) || RUNNER_IO_CONCURRENCY), values.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}

function statePollDelay(options) {
  const intervalMs = Math.max(0, Number(options.statePollIntervalMs ?? STATE_POLL_INTERVAL_MS));
  const jitterMs = Math.max(0, Number(options.statePollJitterMs ?? STATE_POLL_JITTER_MS));
  return intervalMs + (jitterMs ? Math.floor(Math.random() * jitterMs) : 0);
}

function stageDefinition(name) {
  const stage = STAGES.find((item) => item.name === String(name));
  if (!stage) throw new Error(`CAPACITY_STATEFUL: unsupported stage ${name}`);
  return stage;
}

export function buildStatefulPlan({ actors, runId, maxUsers = STATEFUL_MAX_USERS, stages: requestedStages = null }) {
  if (!Array.isArray(actors) || actors.length < maxUsers) {
    throw new Error(`CAPACITY_STATEFUL: manifest must contain at least ${maxUsers} dedicated actors`);
  }
  if (maxUsers < 5 || maxUsers > STATEFUL_MAX_USERS || !STAGES.some((stage) => stage.count === maxUsers)) {
    throw new Error(`CAPACITY_STATEFUL: maxUsers must be one of the progressive levels up to ${STATEFUL_MAX_USERS}`);
  }
  const stageCounts = requestedStages?.length ? requestedStages : STAGES.filter((stage) => stage.count <= maxUsers).map((stage) => stage.count);
  const stages = stageCounts.map((stageCount) => {
    const stage = STAGES.find((candidate) => candidate.count === Number(stageCount));
    if (!stage || stage.count > maxUsers) throw new Error(`CAPACITY_STATEFUL: unsupported stage ${stageCount} for maxUsers ${maxUsers}`);
    const selected = actors.slice(0, stage.count);
    if (selected.length !== stage.count) throw new Error(`CAPACITY_STATEFUL: stage ${stage.name} lacks actors`);
    const counts = selected.reduce((acc, actor) => {
      const role = String(actor.role || actor.mode || "").toLowerCase();
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    if ((counts.ranked || 0) !== stage.ranked || (counts.casual || 0) !== stage.casual || (counts.fragmented || 0) !== stage.fragmented) {
      throw new Error(`CAPACITY_STATEFUL: stage ${stage.name} actor roles do not match the approved workload`);
    }
    return { ...stage, actorIds: selected.map((actor) => actor.actorId) };
  });
  return { runId, mode: "stateful", maxUsers, stages, allowedPostPaths: STATEFUL_PATHS.map((pattern) => pattern.toString()) };
}

export function statefulDryRunPlan({ actors = [], runId, maxUsers = STATEFUL_MAX_USERS, stages = null }) {
  const plan = buildStatefulPlan({ actors, runId, maxUsers, stages });
  return {
    ...plan,
    networkExecuted: false,
    mutationPaths: ["/api/auth/login", "/api/online", "/api/offline", "/api/matchmaking/*", "/api/room/:code/*", "Supabase messages insert", "Supabase Realtime subscribe"],
    safety: {
      maxStageUsers: STATEFUL_MAX_USERS,
      progressiveSequence: "5 -> 10 -> 20 -> 30 -> 40 -> 50 -> 75 -> 100 -> 125 -> 150 -> 200 -> 300 -> 400 -> 500",
      rawSql: false,
      serviceRole: false,
      globalKillSwitch: true,
    },
  };
}

function matchInput(actor) {
  const role = String(actor.role || actor.mode || "").toLowerCase();
  if (role === "ranked") {
    return { gameId: "deadlock", mode: "ranked", rankCode: actor.match?.rankCode || "oracle", desiredRoles: [], ownRoles: [], teammateRoles: [], microphonePreference: "any" };
  }
  if (role === "fragmented") {
    const size = actor.match?.fragmentedSize || (actor.actorId.endsWith("A") ? 1 : 5);
    return { gameId: "deadlock", mode: "casual", desiredRoles: [], ownRoles: [], teammateRoles: [], microphonePreference: "any", desiredTeammates: size, minTeammates: size };
  }
  return { gameId: "deadlock", mode: "casual", desiredRoles: [], ownRoles: [], teammateRoles: [], microphonePreference: "any", desiredTeammates: 2, minTeammates: 2 };
}

function actorById(runtimes, actorId) {
  const runtime = runtimes.get(actorId);
  if (!runtime) throw new Error(`CAPACITY_STATEFUL: unknown actor ${actorId}`);
  return runtime;
}

async function appendLedgerEvent(ledger, event) {
  if (ledger.append) return ledger.append(event);
  ledger.events.push(event);
  if (ledger.writer) await ledger.writer.append(event);
  return event;
}

async function recordEvent(runtime, event, ledger = runtime.ledger) {
  const now = new Date().toISOString();
  const actionEvent = buildActionEvent({
    runId: ledger.runId,
    actorId: runtime.actorId,
    action: event.action,
    endpoint: event.endpoint || "client://stateful",
    requestId: event.request_id || randomUUID(),
    startedAt: event.started_at || now,
    finishedAt: event.finished_at || now,
    latencyMs: event.latency_ms || 0,
    httpStatus: event.http_status ?? null,
    error: event.error || null,
    identifiers: { ...snapshotIds(runtime), ...event.identifiers },
    expectedState: event.expected_state || null,
    actualState: event.actual_state || snapshotState(runtime.state),
  });
  const extras = { ...event };
  for (const key of ["action", "endpoint", "request_id", "started_at", "finished_at", "latency_ms", "http_status", "error", "expected_state", "actual_state"]) delete extras[key];
  return appendLedgerEvent(ledger, {
    ...actionEvent,
    stage: event.stage || null,
    user_id: runtime.userId,
    ...extras,
  });
}

function httpError(action, status) {
  const error = new Error(`${action} returned HTTP ${status}`);
  error.name = "HttpError";
  error.code = `HTTP_${status}`;
  return error;
}

function expectedStateLabel(expectedState) {
  if (expectedState && typeof expectedState === "object" && expectedState.label) return expectedState.label;
  return typeof expectedState === "function" ? "predicate" : expectedState || null;
}

function expectedStatePredicate(expectedState) {
  if (typeof expectedState === "function") return expectedState;
  return expectedState && typeof expectedState === "object" ? expectedState.predicate : null;
}

export async function reconcileMutation({ runtime, options, stage, action, ledger, beforeState, expectedState }) {
  const predicate = expectedStatePredicate(expectedState);
  try {
    const stateResult = await statefulRequest({
      runtime,
      options,
      stage,
      action: `${action}.reconcile.state`,
      requestPath: "/api/state",
      ledger,
      reconciliation: true,
      skipStageDeadline: true,
    });
    runtime.state = stateResult.data;
    runtime.ids = { ...runtime.ids, ...snapshotIds(runtime) };
    await statefulRequest({
      runtime,
      options,
      stage,
      action: `${action}.reconcile.session`,
      requestPath: "/api/session",
      ledger,
      reconciliation: true,
      skipStageDeadline: true,
    });
    const actualState = snapshotState(runtime.state);
    return {
      outcome: classifyMutationOutcome({ expectedState: predicate, beforeState: snapshotState(beforeState), afterState: actualState }),
      actualState,
    };
  } catch {
    return { outcome: "UNKNOWN", actualState: snapshotState(runtime.state) };
  }
}

export async function statefulRequest({ runtime, options, stage, action, method = "GET", requestPath, body, ledger, expectedState = null, reconciliation = false, skipStageDeadline = false }) {
  const operation = assertSafeOperation({ mode: "stateful", method, path: requestPath });
  const requestId = randomUUID();
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const identifiers = snapshotIds(runtime);
  const expected = expectedStateLabel(expectedState);
  const appendNoSend = async (error, mutationOutcome = operation.mutation ? "NOT_COMMITTED_CONFIRMED" : null) => appendLedgerEvent(ledger, buildActionEvent({
    runId: options.runId,
    actorId: runtime.actorId,
    action,
    endpoint: operation.path,
    requestId,
    startedAt,
    finishedAt: new Date().toISOString(),
    latencyMs: performance.now() - started,
    httpStatus: null,
    error,
    identifiers,
    expectedState: expected,
    actualState: snapshotState(runtime.state),
    mutationOutcome,
  }));

  if (!skipStageDeadline && ledger.stageDeadline && Date.now() >= ledger.stageDeadline) {
    const error = timeoutError("stage", `stage ${stage} deadline exceeded before ${action}`);
    await appendNoSend(error);
    throw error;
  }
  if (operation.mutation && ledger.mutationBlocked && !reconciliation) {
    const error = new Error(`mutation blocked after unresolved timeout; refusing ${action}`);
    error.name = "MutationHaltedError";
    error.code = "CAPACITY_MUTATION_HALTED";
    await appendNoSend(error, "UNKNOWN");
    throw error;
  }
  if (ledger.requestCount >= options.maxRequests) {
    const error = new Error("CAPACITY_STATEFUL: request budget exhausted");
    error.name = "RequestBudgetError";
    await appendNoSend(error);
    throw error;
  }
  ledger.requestCount += 1;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${runtime.accessToken}`,
    "User-Agent": `jiyuan-capacity-stateful/${options.runId}`,
    "X-Capacity-Run-Id": options.runId,
    "X-Request-ID": requestId,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = requestId;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.requestTimeoutMs);
  let status = null;
  let eventRecorded = false;
  let data = {};
  try {
    const response = await fetch(new URL(operation.path, options.baseUrl), {
      method: operation.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    status = response.status;
    try { data = await response.json(); } catch { /* body intentionally omitted */ }
    const error = response.ok ? null : httpError(action, status);
    await appendLedgerEvent(ledger, buildActionEvent({
      runId: options.runId,
      actorId: runtime.actorId,
      action,
      endpoint: operation.path,
      requestId,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: performance.now() - started,
      httpStatus: status,
      error,
      identifiers: { ...identifiers, ...snapshotState(data) },
      expectedState: expected,
      actualState: snapshotState(data.user || data.matchmaking || data.room || data.session ? data : runtime.state),
      mutationOutcome: operation.mutation ? (error ? "NOT_COMMITTED_CONFIRMED" : "COMMITTED_RESPONSE_RECEIVED") : null,
    }));
    eventRecorded = true;
    if (!response.ok) throw error;
    return { data, status, requestId };
  } catch (rawError) {
    const error = timedOut ? timeoutError("request", `${action} request timed out`, rawError) : rawError;
    let mutationOutcome = null;
    let actualState = snapshotState(runtime.state);
    if (timedOut && operation.mutation && !reconciliation) {
      ledger.mutationBlocked = true;
      const reconciliationResult = await reconcileMutation({ runtime, options, stage, action, ledger, beforeState: runtime.state, expectedState });
      mutationOutcome = reconciliationResult.outcome;
      actualState = reconciliationResult.actualState;
    }
    if (!eventRecorded) {
      await appendLedgerEvent(ledger, buildActionEvent({
        runId: options.runId,
        actorId: runtime.actorId,
        action,
        endpoint: operation.path,
        requestId,
        startedAt,
        finishedAt: new Date().toISOString(),
        latencyMs: performance.now() - started,
        httpStatus: status,
        error,
        identifiers: { ...identifiers, ...snapshotState(data) },
        expectedState: expected,
        actualState,
        mutationOutcome: operation.mutation ? (mutationOutcome || "UNKNOWN") : null,
      }));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createRealtimeClient(runtime) {
  const client = createClient(runtime.config.supabaseUrl, runtime.config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.setSession({ access_token: runtime.accessToken, refresh_token: runtime.refreshToken });
  if (error) throw error;
  return client;
}

function realtimeRecord(runtime, stage, payload) {
  const record = {
    stage,
    actor_id: runtime.actorId,
    user_id: runtime.userId,
    received_at: new Date().toISOString(),
    channel: payload.channel || "node-events",
    status: payload.status || null,
    table: payload.table || null,
    event: payload.event || null,
    message_id: payload.messageId || null,
    room_id: payload.roomId || null,
    sender_user_id: payload.senderUserId || null,
  };
  runtime.realtime.push(record);
  runtime.realtimeLedger?.push(record);
}

export async function subscribeChannel(runtime, stage, name, configure) {
  const channel = runtime.client.channel(name);
  configure(channel);
  let subscribed = false;
  let terminalStatus = null;
  const statusPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), runtime.realtimeTimeoutMs || 15_000);
    channel.subscribe((status) => {
      realtimeRecord(runtime, stage, { channel: name, status });
      if (status === "SUBSCRIBED") {
        subscribed = true;
        clearTimeout(timer);
        resolve(true);
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        terminalStatus = status;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
  const ok = await statusPromise;
  if (!ok) throw timeoutError("realtime_wait", `Realtime ${name} ${terminalStatus || "subscribe timeout"}`);
  return subscribed;
}

async function subscribeActor(runtime, stage) {
  try {
    runtime.client = await createRealtimeClient(runtime);
    await subscribeChannel(runtime, stage, "node-events", (channel) => {
      for (const table of ["matchmaking_tickets", "matchmaking_pairs", "matchmaking_confirmations", "matchmaking_groups", "matchmaking_group_members", "rooms", "sessions", "session_goodbye_requests", "friendships", "room_members"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
          realtimeRecord(runtime, stage, { table, event: payload.event, roomId: payload.new?.room_id || payload.old?.room_id, messageId: payload.new?.id || payload.old?.id });
        });
      }
    });
  } catch (error) {
    await recordEvent(runtime, { stage, action: "realtime.subscribe", endpoint: "supabase://realtime", error }, runtime.ledger).catch(() => {});
    throw error;
  }
}

async function subscribeRoom(runtime, stage, roomId) {
  if (runtime.roomChannels.has(roomId)) return;
  const name = `room-chat-${roomId}`;
  await subscribeChannel(runtime, stage, name, (channel) => {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (payload) => {
      realtimeRecord(runtime, stage, {
        channel: name,
        table: "messages",
        event: "INSERT",
        messageId: payload.new?.id,
        roomId: payload.new?.room_id,
        senderUserId: payload.new?.sender_id,
      });
    });
  });
  runtime.roomChannels.add(roomId);
}

export function startHeartbeat(runtime, options, stage, ledger) {
  if (runtime.heartbeat) return;
  const beat = async () => {
    if (runtime.heartbeatInFlight) {
      runtime.presence.push({
        stage,
        actor_id: runtime.actorId,
        timestamp: new Date().toISOString(),
        online: true,
        skipped: "heartbeat_in_flight",
      });
      return;
    }
    runtime.heartbeatInFlight = true;
    try {
      await statefulRequest({ runtime, options, stage, action: "presence.heartbeat", method: "POST", requestPath: "/api/online", body: {}, ledger });
      runtime.presence.push({ stage, actor_id: runtime.actorId, timestamp: new Date().toISOString(), online: true });
    } catch (error) {
      runtime.presence.push({ stage, actor_id: runtime.actorId, timestamp: new Date().toISOString(), online: false, error: safeError(error) });
    } finally {
      runtime.heartbeatInFlight = false;
    }
  };
  runtime.heartbeat = setInterval(beat, options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(runtime) {
  if (runtime.heartbeat) clearInterval(runtime.heartbeat);
  runtime.heartbeat = null;
}

export async function closeClient(runtime) {
  stopHeartbeat(runtime);
  if (runtime.client) {
    await withTimeout(runtime.client.removeAllChannels(), runtime.cleanupTimeoutMs || 30_000, "cleanup", `Realtime cleanup timed out for ${runtime.actorId}`);
    runtime.client = null;
  }
  runtime.roomChannels.clear();
}

function snapshotIds(runtime) {
  const state = runtime.state || {};
  const mm = state.matchmaking || {};
  return {
    ticket_id: mm.ticket?.id || null,
    pair_id: mm.pair?.id || null,
    group_id: mm.group?.id || null,
    room_id: state.room?.id || null,
    room_code: state.room?.code || state.session?.roomCode || null,
    session_id: state.session?.id || null,
  };
}

export async function refreshState(runtime, options, stage, ledger, action = "state.read") {
  if (runtime.stateReadInFlight) {
    await recordEvent(runtime, {
      stage,
      action: `${action}.deduplicated`,
      endpoint: "runner://state-poll",
      expected_state: "reuse in-flight state read",
      actual_state: snapshotState(runtime.state),
      deduplicated: true,
    }, ledger);
    return runtime.stateReadInFlight;
  }

  const request = (async () => {
    const result = await statefulRequest({ runtime, options, stage, action, requestPath: "/api/state", ledger });
    runtime.state = result.data;
    runtime.ids = { ...runtime.ids, ...snapshotIds(runtime) };
    if (runtime.ids.room_id) await subscribeRoom(runtime, stage, runtime.ids.room_id);
    return result.data;
  })();
  runtime.stateReadInFlight = request;
  try {
    return await request;
  } finally {
    if (runtime.stateReadInFlight === request) runtime.stateReadInFlight = null;
  }
}

function isTransientTransportError(error) {
  return error?.cause_code === "ECONNRESET" || error?.cause?.code === "ECONNRESET";
}

export async function markOnline(runtime, options, stage, ledger) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await statefulRequest({ runtime, options, stage, action: "presence.online", method: "POST", requestPath: "/api/online", body: {}, ledger });
    } catch (error) {
      if (attempt !== 0 || !isTransientTransportError(error)) throw error;
      await recordEvent(runtime, {
        stage,
        action: "presence.online.transport_retry",
        endpoint: "runner://transport-retry",
        error,
        expected_state: "one idempotent presence retry after ECONNRESET",
        actual_state: snapshotState(runtime.state),
        retry_attempt: 1,
      }, ledger);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw new Error("CAPACITY_STATEFUL: presence retry exhausted");
}

async function startActor(runtime, options, stage, ledger) {
  await markOnline(runtime, options, stage, ledger);
  startHeartbeat(runtime, options, stage, ledger);
  await statefulRequest({ runtime, options, stage, action: "matchmaking.start", method: "POST", requestPath: "/api/matchmaking/start", body: { match: matchInput(runtime.actor) }, ledger });
}

async function controlGroups(runtimes, options, stage, ledger, controls) {
  for (const runtime of runtimes.values()) {
    const group = runtime.state?.matchmaking?.group;
    if (!group) continue;
    const liveMembers = (group.members || []).filter((member) => member.decision !== "rejected");
    if (["searching", "partial_ready"].includes(group.state) && group.ownerUserId === runtime.userId && liveMembers.length >= Number(group.desiredTeammates || 1) + 1 && !controls.started.has(group.id)) {
      controls.started.add(group.id);
      await statefulRequest({ runtime, options, stage, action: "matchmaking.group.start", method: "POST", requestPath: "/api/matchmaking/group/start", body: { groupId: group.id }, ledger });
    }
    if (group.state === "waiting_confirmation") {
      for (const member of liveMembers) {
        if (member.userId === group.ownerUserId || member.decision === "accepted" || controls.confirmed.has(`${group.id}:${member.userId}`)) continue;
        const memberRuntime = [...runtimes.values()].find((candidate) => candidate.userId === member.userId);
        if (!memberRuntime) continue;
        controls.confirmed.add(`${group.id}:${member.userId}`);
        await statefulRequest({ runtime: memberRuntime, options, stage, action: "matchmaking.group.confirm", method: "POST", requestPath: "/api/matchmaking/confirm", body: { groupId: group.id, decision: "accepted" }, ledger });
      }
    }
  }
}

export async function waitForRooms(runtimes, expectedCount, options, stage, ledger) {
  const controls = { started: new Set(), confirmed: new Set() };
  const deadline = Date.now() + Math.min(120_000, options.durationSec * 1000);
  while (Date.now() < deadline) {
    await runWithConcurrency([...runtimes.values()], options.stateReadConcurrency, (runtime) => refreshState(runtime, options, stage, ledger));
    await controlGroups(runtimes, options, stage, ledger, controls);
    const active = [...runtimes.values()].filter((runtime) => ACTIVE_SESSION_STATES.has(runtime.state?.session?.status) && runtime.state?.room);
    if (active.length >= expectedCount) {
      await runWithConcurrency(active, options.stateReadConcurrency, (runtime) => refreshState(runtime, options, stage, ledger));
      const stable = active.filter((runtime) => ACTIVE_SESSION_STATES.has(runtime.state?.session?.status) && runtime.state?.room);
      if (stable.length >= expectedCount) return;
    }
    await sleep(statePollDelay(options));
  }
  throw timeoutError("matching_wait", `stage ${stage} did not form ${expectedCount} active sessions`);
}

function roomGroups(runtimes) {
  const groups = new Map();
  for (const runtime of runtimes.values()) {
    const code = runtime.state?.room?.code || runtime.state?.session?.roomCode;
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(runtime);
  }
  return groups;
}

async function verifyRoomShape(groups, expectedRooms, stage) {
  if (groups.size !== expectedRooms) throw new Error(`CAPACITY_STATEFUL: stage ${stage} expected ${expectedRooms} rooms, saw ${groups.size}`);
  const seenSessions = new Set();
  for (const [code, members] of groups) {
    const sessionIds = new Set(members.map((runtime) => runtime.state?.session?.id).filter(Boolean));
    if (sessionIds.size !== 1) throw new Error(`CAPACITY_STATEFUL: room ${code} has inconsistent session IDs`);
    const sessionId = [...sessionIds][0];
    if (seenSessions.has(sessionId)) throw new Error(`CAPACITY_STATEFUL: duplicate session ${sessionId}`);
    seenSessions.add(sessionId);
    const expectedMembers = Number(members[0].state?.session?.targetTotalPlayers || members[0].state?.session?.players?.length || members.length);
    if (expectedMembers !== members.length) throw new Error(`CAPACITY_STATEFUL: room ${code} member count mismatch`);
  }
}

async function sendRoomMessages(group, runtime, options, stage, ledger, messageLedger) {
  const roomId = runtime.state?.room?.id;
  if (!roomId || !runtime.client) throw new Error("CAPACITY_STATEFUL: cannot send chat without a room client");
  if (ledger.mutationBlocked) {
    const error = new Error("mutation blocked after unresolved timeout; refusing chat message");
    error.name = "MutationHaltedError";
    error.code = "CAPACITY_MUTATION_HALTED";
    await appendLedgerEvent(ledger, buildActionEvent({
      runId: options.runId,
      actorId: runtime.actorId,
      action: "chat.send",
      endpoint: "supabase://messages",
      requestId: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: 0,
      error,
      identifiers: snapshotIds(runtime),
      actualState: snapshotState(runtime.state),
      mutationOutcome: "UNKNOWN",
    }));
    throw error;
  }
  await subscribeRoom(runtime, stage, roomId);
  const markers = [
    `capacity-${options.runId}-${stage}-${runtime.actorId}-${randomUUID()}`,
    `quick-${options.runId}-${stage}-${runtime.actorId}-${randomUUID()}`,
  ];
  for (const marker of markers) {
    const sentAt = new Date().toISOString();
    const requestId = randomUUID();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    let result;
    let mutationOutcome = "COMMITTED_RESPONSE_RECEIVED";
    try {
      result = await withTimeout(
        runtime.client.from("messages").insert({ room_id: roomId, sender_id: runtime.userId, content: marker }).select("id,room_id,sender_id,created_at").single(),
        options.requestTimeoutMs,
        "request",
        `chat.send timed out for ${runtime.actorId}`,
      );
      if (result.error) throw result.error;
    } catch (rawError) {
      const error = rawError?.name === "TimeoutError" ? rawError : rawError;
      if (error?.name === "TimeoutError") {
        ledger.mutationBlocked = true;
        const reconciliation = await reconcileMutation({ runtime, options, stage, action: "chat.send", ledger, beforeState: runtime.state, expectedState: null });
        mutationOutcome = reconciliation.outcome;
      } else {
        mutationOutcome = "UNKNOWN";
      }
      await appendLedgerEvent(ledger, buildActionEvent({
        runId: options.runId,
        actorId: runtime.actorId,
        action: "chat.send",
        endpoint: "supabase://messages",
        requestId,
        startedAt,
        finishedAt: new Date().toISOString(),
        latencyMs: performance.now() - started,
        error,
        identifiers: snapshotIds(runtime),
        actualState: snapshotState(runtime.state),
        mutationOutcome,
      }));
      throw error;
    }
    const data = result.data;
    await appendLedgerEvent(ledger, buildActionEvent({
      runId: options.runId,
      actorId: runtime.actorId,
      action: "chat.send",
      endpoint: "supabase://messages",
      requestId,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: performance.now() - started,
      httpStatus: 200,
      identifiers: { ...snapshotIds(runtime), room_id: roomId },
      actualState: { ...snapshotState(runtime.state), message_id: data.id },
      mutationOutcome,
    }));
    messageLedger.push({ stage, message_id: data.id, room_id: roomId, session_id: runtime.state?.session?.id || null, sender_user_id: runtime.userId, marker, sent_at: sentAt, persisted_at: data.created_at || new Date().toISOString(), expected_recipients: group.map((member) => member.userId), received_by: [] });
  }
  await sleep(1500);
  for (const message of messageLedger.filter((entry) => entry.stage === stage && entry.room_id === roomId)) {
    message.received_by = group.filter((member) => member.realtime.some((event) => event.message_id === message.message_id)).map((member) => member.userId);
    if (message.received_by.length !== group.length) throw new Error(`CAPACITY_STATEFUL: realtime message delivery incomplete for ${message.message_id}`);
  }
}

async function refreshActor(runtime, options, stage, ledger) {
  const before = snapshotIds(runtime);
  await closeClient(runtime);
  await sleep(250);
  await subscribeActor(runtime, stage);
  startHeartbeat(runtime, options, stage, ledger);
  await refreshState(runtime, options, stage, ledger, "refresh.recover");
  const after = snapshotIds(runtime);
  recordEvent(runtime, { stage, action: "refresh.verify", before, after, side_effect: false });
  if (before.room_id && (before.room_id !== after.room_id || before.session_id !== after.session_id)) throw new Error(`CAPACITY_STATEFUL: refresh changed room/session for ${runtime.actorId}`);
}

async function disconnectAndReconnect(runtime, options, stage, ledger, durationMs) {
  const before = snapshotIds(runtime);
  stopHeartbeat(runtime);
  await closeClient(runtime);
  recordEvent(runtime, { stage, action: "reconnect.disconnected", duration_ms: durationMs, before });
  await sleep(durationMs);
  await subscribeActor(runtime, stage);
  startHeartbeat(runtime, options, stage, ledger);
  await refreshState(runtime, options, stage, ledger, "reconnect.recover");
  const after = snapshotIds(runtime);
  recordEvent(runtime, { stage, action: "reconnect.verify", before, after, within_grace: durationMs < 180_000, side_effect: false });
  return { before, after, recoveredSameSession: before.session_id === after.session_id && before.room_id === after.room_id };
}

async function requestGoodbye(group, options, stage, ledger) {
  const code = group[0].state?.room?.code || group[0].state?.session?.roomCode;
  await Promise.all(group.map((runtime) => statefulRequest({ runtime, options, stage, action: "goodbye", method: "POST", requestPath: `/api/room/${code}/goodbye`, body: { requested: true }, ledger })));
}

async function explicitLeave(runtime, options, stage, ledger) {
  const code = runtime.state?.room?.code || runtime.state?.session?.roomCode;
  if (!code) return;
  await statefulRequest({ runtime, options, stage, action: "leave", method: "POST", requestPath: `/api/room/${code}/exit`, body: {}, ledger });
}

async function submitFeedback(runtime, options, stage, ledger) {
  const session = runtime.state?.session;
  const code = runtime.state?.room?.code || session?.roomCode;
  if (!code || session?.status !== "completed") return;
  const members = Array.isArray(session.members) ? session.members : (session.players || []).map((id) => ({ userId: id }));
  await statefulRequest({ runtime, options, stage, action: "feedback.rating", method: "POST", requestPath: `/api/room/${code}/feedback`, body: { rating: "happy", wantAgain: true }, ledger });
  for (const member of members) {
    const targetUserId = member.userId || member.id;
    if (targetUserId && targetUserId !== runtime.userId) {
      await statefulRequest({ runtime, options, stage, action: "feedback.like", method: "POST", requestPath: `/api/room/${code}/feedback`, body: { targetUserId, liked: true }, ledger });
    }
  }
}

export async function waitForTerminal(runtimes, options, stage, ledger, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await runWithConcurrency([...runtimes.values()], options.stateReadConcurrency, (runtime) => refreshState(runtime, options, stage, ledger, "state.reconcile"));
    const active = [...runtimes.values()].filter((runtime) => runtime.state?.room && ACTIVE_SESSION_STATES.has(runtime.state?.session?.status));
    if (!active.length) return;
    await sleep(statePollDelay(options));
  }
  throw timeoutError("stage", `stage ${stage} lifecycle did not converge`);
}

async function cancelRemaining(runtimes, options, stage, ledger) {
  for (const runtime of runtimes.values()) {
    const mm = runtime.state?.matchmaking;
    if (mm?.ticket && !runtime.state?.room) {
      await statefulRequest({ runtime, options, stage, action: "matchmaking.cancel", method: "POST", requestPath: "/api/matchmaking/cancel", body: { reason: "capacity_rehearsal_cleanup" }, ledger }).catch(() => {});
    }
  }
}

async function runStage({ stage, runtimes, options, ledger, messageLedger }) {
  const expectedActive = stage.count - stage.fragmented;
  const expectedRooms = stage.ranked / 2 + stage.casual / 3;
  const activeRuntimes = new Map([...runtimes].filter(([, runtime]) => runtime.role !== "fragmented"));
  await Promise.all([...runtimes.values()].map((runtime) => closeClient(runtime)));
  await runWithConcurrency([...runtimes.values()], options.realtimeConcurrency, (runtime) => subscribeActor(runtime, stage.name));
  await Promise.all([...runtimes.values()].map((runtime) => startActor(runtime, options, stage.name, ledger)));
  await waitForRooms(runtimes, expectedActive, options, stage.name, ledger);
  const groups = roomGroups(activeRuntimes);
  await verifyRoomShape(groups, expectedRooms, stage.name);
  await Promise.all([...groups.values()].map((group) => sendRoomMessages(group, group[0], options, stage.name, ledger, messageLedger)));

  const refreshTargets = stage.name === "5" ? [activeRuntimes.values().next().value] : [...activeRuntimes.values()].slice(0, 2);
  await Promise.all(refreshTargets.filter(Boolean).map((runtime) => refreshActor(runtime, options, stage.name, ledger)));
  const reconnectTarget = [...activeRuntimes.values()][stage.name === "5" ? 0 : 1];
  if (reconnectTarget) await disconnectAndReconnect(reconnectTarget, options, stage.name, ledger, 60_000);
  if (stage.name === "20") {
    const longDisconnectTarget = [...activeRuntimes.values()][2];
    if (longDisconnectTarget) await disconnectAndReconnect(longDisconnectTarget, options, stage.name, ledger, 181_000);
  }

  const finalGroups = roomGroups(activeRuntimes);
  const leaveGroup = stage.name === "5" ? null : [...finalGroups.values()][0];
  if (leaveGroup?.[0]) await explicitLeave(leaveGroup[0], options, stage.name, ledger);
  for (const [code, group] of finalGroups) {
    if (leaveGroup === group) continue;
    const live = group.filter((runtime) => ACTIVE_SESSION_STATES.has(runtime.state?.session?.status));
    if (live.length) await requestGoodbye(live, options, stage.name, ledger);
  }
  await waitForTerminal(runtimes, options, stage.name, ledger, stage.name === "20" ? 45_000 : 30_000).catch((error) => { throw error; });
  await Promise.all([...runtimes.values()].map((runtime) => refreshState(runtime, options, stage.name, ledger, "state.final")));
  await Promise.all([...runtimes.values()].map((runtime) => submitFeedback(runtime, options, stage.name, ledger)));
  await cancelRemaining(runtimes, options, stage.name, ledger);
  const activeAfter = [...runtimes.values()].filter((runtime) => runtime.state?.room && ACTIVE_SESSION_STATES.has(runtime.state?.session?.status));
  if (activeAfter.length) throw new Error(`CAPACITY_STATEFUL: stage ${stage.name} left ${activeAfter.length} active test sessions`);
  return {
    stage: stage.name,
    status: "PASS",
    users: stage.count,
    expectedRooms,
    activeUsers: expectedActive,
    actorIds: [...runtimes.keys()],
    realtimeSubscriptions: [...runtimes.values()].map((runtime) => runtime.realtime.filter((event) => event.status === "SUBSCRIBED").length),
    messages: messageLedger.filter((message) => message.stage === stage.name).map(({ marker, ...safe }) => safe),
  };
}

export async function runStatefulRehearsal({ options, manifest, credentials }) {
  const plan = buildStatefulPlan({ actors: manifest.actors, runId: options.runId, maxUsers: options.maxUsers, stages: options.stages });
  const evidenceDirectory = options.evidenceDir || path.join(process.cwd(), "output", "capacity-validation", options.runId);
  const writer = await createAppendOnlyLedger({ directory: evidenceDirectory });
  const ledger = { runId: options.runId, requestCount: 0, events: [], writer, mutationBlocked: false, stageDeadline: 0 };
  ledger.append = async (event) => {
    ledger.events.push(event);
    return writer.append(event);
  };
  const config = await loadAuthConfig(options.baseUrl, {
    requestContext: { runId: options.runId, actorId: "__system__", action: "auth.config" },
    ledger,
  });
  const credentialsById = new Map(credentials.map((credential) => [credential.identity, credential]));
  let activeRuntimes = new Map();
  const messageLedger = [];
  const presenceLedger = [];
  const realtimeLedger = [];
  const startedAt = new Date().toISOString();
  try {
    const stages = [];
    for (const stage of plan.stages) {
      ledger.stage = stage.name;
      ledger.stageDeadline = Date.now() + (options.stageTimeoutMs || Math.max(300_000, (options.durationSec || 60) * 4_000));
      const stageRuntimes = new Map();
      activeRuntimes = stageRuntimes;
      try {
        for (const [actorIndex, actor] of manifest.actors.filter((candidate) => stage.actorIds.includes(candidate.actorId)).entries()) {
          const credential = credentialsById.get(actor.actorId);
          if (!credential) throw new Error(`CAPACITY_AUTH: no stateful credential for ${actor.actorId}`);
          if (actorIndex > 0) await sleep(Math.max(1_000, Number(options.authDelayMs || 10_000)));
          const session = await authenticateIdentity({ baseUrl: options.baseUrl, credential, ledger, runId: options.runId, actorId: actor.actorId });
          const runtime = {
            actor,
            actorId: actor.actorId,
            role: String(actor.role || actor.mode || "").toLowerCase(),
            userId: actor.userId !== "UNKNOWN" ? actor.userId : null,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            tokenExpiry: session.tokenExpiry,
            config,
            client: null,
            heartbeat: null,
            roomChannels: new Set(),
            state: null,
            ids: {},
            events: ledger.events,
            realtime: [],
            realtimeLedger,
            presence: presenceLedger,
            ledger,
            cleanupTimeoutMs: options.cleanupTimeoutMs || 30_000,
          };
          stageRuntimes.set(actor.actorId, runtime);
          const state = await statefulRequest({ runtime, options, stage: stage.name, action: "state.smoke", requestPath: "/api/state", ledger });
          runtime.state = state.data;
          runtime.userId = state.data?.user?.id || runtime.userId;
          if (!runtime.userId) throw new Error(`CAPACITY_AUTH: ${actor.actorId} state has no user id`);
          actor.userId = runtime.userId;
        }
        const userIds = new Set([...stageRuntimes.values()].map((runtime) => runtime.userId));
        if (userIds.size !== stageRuntimes.size) throw new Error(`CAPACITY_AUTH: stage ${stage.name} identity isolation failed`);
        const result = await runStage({ stage, runtimes: stageRuntimes, options, ledger, messageLedger });
        stages.push(result);
      } finally {
        await Promise.all([...stageRuntimes.values()].map((runtime) => closeClient(runtime).catch(async (error) => {
          await recordEvent(runtime, { action: "cleanup", endpoint: "client://realtime", error, stage: ledger.stage }, ledger).catch(() => {});
        })));
        clearActorTokens([...stageRuntimes.values()]);
        activeRuntimes = new Map();
      }
    }
    await writer.flush();
    return { runId: options.runId, mode: "stateful", startedAt, endedAt: new Date().toISOString(), stages, requests: ledger.events, messages: messageLedger, presence: presenceLedger, realtime: realtimeLedger, identityIsolation: true, productionMutation: true, plan, ledgerFile: writer.file };
  } catch (error) {
    await appendLedgerEvent(ledger, buildActionEvent({
      runId: options.runId,
      actorId: "__stage__",
      action: "stage.failure",
      endpoint: "runner://stage",
      requestId: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: 0,
      error,
      identifiers: {},
      expectedState: "stage must complete without unclassified timeout",
      actualState: { stage: ledger.stage || "preflight", mutation_blocked: ledger.mutationBlocked },
      mutationOutcome: error?.timeoutSource === "request" && ledger.mutationBlocked ? "UNKNOWN" : null,
    }));
    await writer.flush();
    error.capacityEvidence = { runId: options.runId, ledgerFile: writer.file, stage: ledger.stage || "preflight", eventCount: ledger.events.length };
    throw error;
  } finally {
    await Promise.all([...activeRuntimes.values()].map((runtime) => closeClient(runtime).catch(async (error) => {
      await recordEvent(runtime, { action: "cleanup", endpoint: "client://realtime", error, stage: ledger.stage }, ledger).catch(() => {});
    })));
    await writer.flush();
    clearActorTokens([...activeRuntimes.values()]);
  }
}

export async function writeStatefulEvidence({ directory, manifest, result }) {
  await mkdir(directory, { recursive: true });
  const safeManifest = {
    run_id: result?.runId || manifest.run_id || "UNKNOWN",
    actors: manifest.actors.slice(0, result?.plan?.maxUsers || manifest.actors.length).map(({ actorId, userId, mode, profile, role, match, scenario }) => ({ actor_id: actorId, user_id: userId, mode, profile, role, match, scenario })),
  };
  const safe = JSON.stringify(safeManifest);
  if (/password|access_token|refresh_token|service_role/i.test(safe)) throw new Error("CAPACITY_STATEFUL: unsafe evidence manifest");
  await writeFile(path.join(directory, "run-manifest.json"), `${JSON.stringify(safeManifest, null, 2)}\n`);
  await writeFile(path.join(directory, "summary.json"), `${JSON.stringify({ runId: result?.runId, mode: result?.mode, startedAt: result?.startedAt, endedAt: result?.endedAt, stages: result?.stages, identityIsolation: result?.identityIsolation, productionMutation: result?.productionMutation }, null, 2)}\n`);
  if (!result?.ledgerFile) {
    await writeFile(path.join(directory, "lifecycle-ledger.ndjson"), `${(result?.requests || []).map((event) => JSON.stringify(event)).join("\n")}\n`);
  }
  await writeFile(path.join(directory, "message-ledger.json"), `${JSON.stringify(result?.messages || [], null, 2)}\n`);
  await writeFile(path.join(directory, "presence-ledger.json"), `${JSON.stringify(result?.presence || [], null, 2)}\n`);
  await writeFile(path.join(directory, "realtime-ledger.json"), `${JSON.stringify(result?.realtime || [], null, 2)}\n`);
  await writeFile(path.join(directory, "plan.json"), `${JSON.stringify(result?.plan || {}, null, 2)}\n`);
}

export async function writeStatefulFailureEvidence({ directory, manifest, runId, error }) {
  await mkdir(directory, { recursive: true });
  const safeManifest = {
    run_id: runId,
    actors: manifest.actors.map(({ actorId, userId, mode, profile, role, match, scenario }) => ({ actor_id: actorId, user_id: userId, mode, profile, role, match, scenario })),
  };
  await writeFile(path.join(directory, "run-manifest.json"), `${JSON.stringify(safeManifest, null, 2)}\n`);
  await writeFile(path.join(directory, "summary.json"), `${JSON.stringify({
    runId,
    mode: "stateful",
    status: "INCONCLUSIVE",
    failure: serializeError(error),
    evidence: error?.capacityEvidence || null,
  }, null, 2)}\n`);
}
