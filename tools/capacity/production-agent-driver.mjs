import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { createAppendOnlyLedger } from "./evidence.mjs";
import { authenticateIdentity, clearActorTokens, loadAuthConfig } from "./runner.mjs";
import {
  closeClient,
  explicitLeave,
  markOnline,
  refreshState,
  startHeartbeat,
  statefulRequest,
  submitFeedback,
  subscribeActor,
} from "./stateful-adapter.mjs";

const ACTIVE_SESSION_STATES = new Set(["ready", "active", "playing", "matched"]);
const TERMINAL_SESSION_STATES = new Set(["completed", "cancelled"]);
const LIVE_GROUP_STATES = new Set(["searching", "partial_ready", "forming", "backfilling"]);

function memberCount(room) {
  const members = Array.isArray(room?.members) ? room.members : [];
  return members.filter((member) => !["exited", "left"].includes(String(member?.status || "active").toLowerCase())).length;
}

export function isMatchedRoomState(state) {
  if (!state?.room) return false;
  if (ACTIVE_SESSION_STATES.has(String(state.session?.status || "").toLowerCase())) return true;
  return memberCount(state.room) >= 2;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampledActor(runId, actorId, cycle, purpose, percent = 10) {
  const value = createHash("sha256").update(`${runId}:${cycle}:${purpose}:${actorId}`).digest().readUInt32BE(0);
  return value % 100 < percent;
}

function requiredRoomMembers(match) {
  if (match?.mode !== "casual") return 2;
  return Math.min(6, Math.max(2, Number(match.minTeammates || 1) + 1));
}

function actorMatched(state, match) {
  if (!isMatchedRoomState(state)) return false;
  if (ACTIVE_SESSION_STATES.has(String(state.session?.status || "").toLowerCase())) return true;
  return memberCount(state.room) >= requiredRoomMembers(match);
}

function actorTerminal(state) {
  if (!state?.room) return true;
  return TERMINAL_SESSION_STATES.has(String(state.session?.status || "").toLowerCase());
}

function ownGroupMember(group, userId) {
  return (group?.members || []).find((member) => (member.userId || member.user_id) === userId);
}

async function waitUntil({ runtime, options, cycle, predicate, timeoutMs, action, progress }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await refreshState(runtime, options, String(cycle), runtime.ledger, action);
    if (progress) await progress(runtime);
    if (predicate(runtime.state)) return runtime.state;
    await sleep(2_000 + Math.floor(Math.random() * 250));
  }
  const error = new Error(`${action} timed out for ${runtime.actorId}`);
  error.name = "CapacityActorTimeoutError";
  error.code = "CAPACITY_ACTOR_TIMEOUT";
  throw error;
}

async function sendChat(runtime, cycle, content) {
  const roomId = runtime.state?.room?.id;
  const roomCode = runtime.state?.room?.code;
  if (!roomId || !roomCode) throw new Error(`chat unavailable for ${runtime.actorId}`);
  const operationId = `capacity-chat:${cycle}:${runtime.actorId}:${randomUUID()}`;
  const result = await statefulRequest({ runtime, options: runtime.options, stage: String(cycle), action: "chat.send", method: "POST", requestPath: `/api/room/${roomCode}/messages`, body: { content, operationId }, ledger: runtime.ledger });
  const message = result.data?.message;
  if (!message?.id) throw new Error(`chat acknowledgement missing for ${runtime.actorId}`);
  runtime.messages.push({ cycle, roomId, messageId: message.id, sentAt: message.created_at || new Date().toISOString() });
}

async function progressConfirmation(runtime, options, cycle) {
  const group = runtime.state?.matchmaking?.group;
  if (!group || group.state !== "waiting_confirmation") return;
  const member = ownGroupMember(group, runtime.userId);
  if (!member || member.decision === "accepted" || runtime.controls.confirmed.has(group.id)) return;
  runtime.controls.confirmed.add(group.id);
  await statefulRequest({
    runtime,
    options,
    stage: String(cycle),
    action: "matchmaking.group.confirm",
    method: "POST",
    requestPath: "/api/matchmaking/confirm",
    body: { groupId: group.id, decision: "accepted" },
    ledger: runtime.ledger,
  });
}

async function voteToStopCasualRecruitment(runtime, options, cycle) {
  await refreshState(runtime, options, String(cycle), runtime.ledger, "state.before_lock");
  const room = runtime.state?.room;
  if (!room?.code || room.recruiting !== true || memberCount(room) < 2) return;
  if (runtime.controls.started.has(room.id)) return;
  runtime.controls.started.add(room.id);
  await statefulRequest({
    runtime,
    options,
    stage: String(cycle),
    action: "room.recruitment.vote",
    method: "POST",
    requestPath: `/api/room/${room.code}/recruitment`,
    body: { requested: true },
    ledger: runtime.ledger,
  });
}

async function holdRoom(runtime, options, cycle, holdMs) {
  const startedAt = Date.now();
  let messageIndex = 0;
  let reconnected = false;
  while (Date.now() - startedAt < holdMs) {
    if (messageIndex < 2) {
      await sendChat(runtime, cycle, `capacity-${options.runId}-${cycle}-${runtime.actorId}-${messageIndex + 1}-${randomUUID()}`);
      messageIndex += 1;
    }
    const remaining = holdMs - (Date.now() - startedAt);
    await sleep(Math.max(0, Math.min(30_000, remaining)));
    if (remaining > 0) await refreshState(runtime, options, String(cycle), runtime.ledger, "room.hold.state");
    if (!reconnected && sampledActor(options.runId, runtime.actorId, cycle, "reconnect") && Date.now() - startedAt >= Math.min(60_000, holdMs / 2)) {
      reconnected = true;
      await closeClient(runtime);
      await sleep(1_000);
      await subscribeActor(runtime, String(cycle));
      startHeartbeat(runtime, options, String(cycle), runtime.ledger);
      await refreshState(runtime, options, String(cycle), runtime.ledger, "room.reconnect.state");
      runtime.reconnects = (runtime.reconnects || 0) + 1;
    }
  }
  if (holdMs === 0) await sendChat(runtime, cycle, `capacity-${options.runId}-${cycle}-${runtime.actorId}-${randomUUID()}`);
}

async function resolveEgressId(runId, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl("https://api.ipify.org?format=json", { headers: { Accept: "application/json" } });
    if (!response.ok) return "unknown";
    const data = await response.json();
    if (!data?.ip) return "unknown";
    return createHash("sha256").update(`${runId}:${data.ip}`).digest("hex").slice(0, 20);
  } catch {
    return "unknown";
  }
}

export async function createProductionAgentDriver({ baseUrl, runId, evidenceDirectory, fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl || !runId) throw new Error("CAPACITY_DISTRIBUTED: baseUrl and runId are required");
  const directory = evidenceDirectory || path.join(process.cwd(), "output", "capacity-validation", runId);
  const writer = await createAppendOnlyLedger({ directory });
  const systemLedger = { runId, requestCount: 0, events: [], writer, mutationBlocked: false, stageDeadline: 0 };
  systemLedger.append = async (event) => {
    systemLedger.events.push(event);
    return writer.append(event);
  };
  const config = await loadAuthConfig(baseUrl, {
    requestContext: { runId, actorId: "__agent__", action: "auth.config" },
    ledger: systemLedger,
  });
  const options = {
    baseUrl,
    runId,
    requestTimeoutMs: 10_000,
    maxRequests: 2_000,
    stateReadConcurrency: 5,
    heartbeatIntervalMs: 10_000,
  };

  function actorLedger(actorId) {
    const ledger = { runId, actorId, requestCount: 0, events: [], writer, mutationBlocked: false, stageDeadline: 0 };
    ledger.append = async (event) => {
      ledger.events.push(event);
      return writer.append(event);
    };
    return ledger;
  }

  return {
    async egressId() {
      return resolveEgressId(runId, fetchImpl);
    },

    async authenticate(credential) {
      const ledger = actorLedger(credential.identity);
      const session = await authenticateIdentity({ baseUrl, credential, ledger, runId, actorId: credential.identity });
      const runtime = {
        actorId: credential.identity,
        authUserId: session.authUserId,
        userId: null,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenExpiry: session.tokenExpiry,
        loginCredential: { identifier: credential.identifier, password: credential.password },
        config,
        client: null,
        clientInstanceId: session.clientInstanceId,
        options,
        heartbeat: null,
        roomChannels: new Set(),
        state: null,
        ids: {},
        events: ledger.events,
        realtime: [],
        realtimeLedger: [],
        presence: [],
        messages: [],
        controls: { started: new Set(), confirmed: new Set() },
        ledger,
        cleanupTimeoutMs: 30_000,
        realtimeTimeoutMs: 15_000,
      };
      const state = await statefulRequest({ runtime, options, stage: "auth", action: "state.identity", requestPath: "/api/state", ledger });
      runtime.state = state.data;
      runtime.userId = state.data?.user?.id || null;
      if (!runtime.userId) throw new Error(`CAPACITY_AUTH: ${credential.identity} state has no profile id`);
      return runtime;
    },

    async runCycle(runtime, actor, cycle, { roomHoldMs }) {
      runtime.ledger.mutationBlocked = false;
      runtime.controls = { started: new Set(), confirmed: new Set() };
      await closeClient(runtime).catch(() => {});
      if (cycle === 3 && sampledActor(runId, runtime.actorId, cycle, "relogin")) {
        const session = await authenticateIdentity({
          baseUrl,
          credential: { identity: runtime.actorId, ...runtime.loginCredential },
          ledger: runtime.ledger,
          runId,
          actorId: runtime.actorId,
        });
        runtime.accessToken = session.accessToken;
        runtime.refreshToken = session.refreshToken;
        runtime.tokenExpiry = session.tokenExpiry;
        runtime.clientInstanceId = session.clientInstanceId;
        runtime.relogins = (runtime.relogins || 0) + 1;
      }
      await subscribeActor(runtime, String(cycle));
      await markOnline(runtime, options, String(cycle), runtime.ledger);
      startHeartbeat(runtime, options, String(cycle), runtime.ledger);
      try {
        await statefulRequest({
          runtime,
          options,
          stage: String(cycle),
          action: "matchmaking.start",
          method: "POST",
          requestPath: "/api/matchmaking/start",
          body: { match: actor.match },
          ledger: runtime.ledger,
        });
        await waitUntil({
          runtime,
          options,
          cycle,
          action: "matching.wait",
          timeoutMs: 180_000,
          predicate: (state) => actorMatched(state, actor.match),
          progress: (current) => progressConfirmation(current, options, cycle),
        });
        await holdRoom(runtime, options, cycle, Number(roomHoldMs) || 0);
        if (Number(roomHoldMs) > 0) {
          const chatDeadline = Date.now() + 10_000;
          while (Date.now() < chatDeadline && !runtime.realtime.some((event) => event.table === "messages" && event.sender_user_id && event.sender_user_id !== runtime.userId)) {
            await sleep(500);
          }
          if (!runtime.realtime.some((event) => event.table === "messages" && event.sender_user_id && event.sender_user_id !== runtime.userId)) {
            const chatError = new Error(`peer chat was not observed for ${runtime.actorId}`);
            chatError.code = "CAPACITY_CHAT_NOT_OBSERVED";
            throw chatError;
          }
        }
        if (actor.match.mode === "casual") await voteToStopCasualRecruitment(runtime, options, cycle);
        await waitUntil({
          runtime,
          options,
          cycle,
          action: "session.wait",
          timeoutMs: 120_000,
          predicate: (state) => ACTIVE_SESSION_STATES.has(String(state.session?.status || "").toLowerCase()),
          progress: (current) => progressConfirmation(current, options, cycle),
        });
        const code = runtime.state?.room?.code || runtime.state?.session?.roomCode;
        if (!code) throw new Error(`room code unavailable for ${runtime.actorId}`);
        await statefulRequest({
          runtime,
          options,
          stage: String(cycle),
          action: "goodbye",
          method: "POST",
          requestPath: `/api/room/${code}/goodbye`,
          body: { requested: true },
          ledger: runtime.ledger,
        });
        await waitUntil({
          runtime,
          options,
          cycle,
          action: "lifecycle.converge",
          timeoutMs: 90_000,
          predicate: actorTerminal,
        });
        await submitFeedback(runtime, options, String(cycle), runtime.ledger).catch(() => {});
        const peerMessages = runtime.realtime.filter((event) => event.table === "messages" && event.sender_user_id && event.sender_user_id !== runtime.userId).length;
        await closeClient(runtime);
        return { exited: true, metrics: { peerMessages, sentMessages: runtime.messages.filter((message) => message.cycle === cycle).length, reconnects: runtime.reconnects || 0, relogins: runtime.relogins || 0 } };
      } catch (error) {
        await explicitLeave(runtime, options, String(cycle), runtime.ledger).catch(() => {});
        await statefulRequest({ runtime, options, stage: String(cycle), action: "matchmaking.cancel", method: "POST", requestPath: "/api/matchmaking/cancel", body: { reason: "distributed_capacity_actor_failure" }, ledger: runtime.ledger }).catch(() => {});
        await closeClient(runtime).catch(() => {});
        throw error;
      }
    },

    async exit(runtime) {
      await explicitLeave(runtime, options, "cleanup", runtime.ledger).catch(() => {});
      await statefulRequest({ runtime, options, stage: "cleanup", action: "matchmaking.cancel", method: "POST", requestPath: "/api/matchmaking/cancel", body: { reason: "distributed_capacity_final_cleanup" }, ledger: runtime.ledger }).catch(() => {});
      await statefulRequest({ runtime, options, stage: "cleanup", action: "presence.offline", method: "POST", requestPath: "/api/offline", body: { reason: "explicit_logout" }, ledger: runtime.ledger }).catch(() => {});
      await closeClient(runtime).catch(() => {});
      runtime.loginCredential.password = "";
      clearActorTokens([runtime]);
    },

    isFatal(error) {
      return error?.code === "CAPACITY_FATAL";
    },

    async close() {
      await writer.flush();
    },
  };
}
