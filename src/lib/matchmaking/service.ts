import { publicProfilesFor } from "../data";
import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import { evaluateCompatibility, rankCandidates } from "./rules";
import {
  claimMatcherLease,
  flushMatcherTelemetry,
  increment as incrementRuntimeMetric,
  isActualSqlSerializationFailure,
  isDatabaseTimeout,
  markActiveTick,
  matcherCircuitOpen,
  nextMatcherTick,
  observeLatency,
  recordMatcherEvent,
  recordTicketProcessed,
  setGauge,
} from "./runtime-telemetry";
import type { MatchGroup, MatchGroupMember, MatchTicket, MatchmakingInput, MatchmakingRuleSet } from "./types";

type TicketRow = Record<string, any>;

function ticketFromRow(row: TicketRow): MatchTicket {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const legacyRoles = Array.isArray(row.desired_roles) ? row.desired_roles : [];
  const hasOwnRoles = Array.isArray(metadata.ownRoles);
  const hasTeammateRoles = Array.isArray(metadata.teammateRoles);
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    mode: row.mode,
    rankCode: row.rank_code,
    desiredRoles: row.desired_roles || [],
    // Preserve the old desired_roles signal for tickets created before the
    // split role fields were introduced. New tickets always write both arrays
    // into metadata, including an explicit empty array for “不限”.
    ownRoles: hasOwnRoles ? metadata.ownRoles : legacyRoles,
    teammateRoles: hasTeammateRoles ? metadata.teammateRoles : legacyRoles,
    microphonePreference: row.microphone_preference,
    state: row.state,
    searchStartedAt: row.search_started_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    preferredTotalPlayers: Number.isInteger(Number(metadata.preferredTotalPlayers))
      ? Number(metadata.preferredTotalPlayers)
      : undefined,
    groupId: row.group_id || null,
  };
}

function groupFromRow(row: TicketRow, members: MatchGroupMember[] = []): MatchGroup {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    state: row.state,
    gameId: row.game_id,
    mode: "casual",
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    confirmationDeadline: row.confirmation_deadline || null,
    roomId: row.room_id || null,
    sessionId: row.session_id || null,
    roomPhase: row.formation_state || null,
    hardMaxPlayers: Number(row.hard_max_players || 6),
    recruitmentMode: row.recruitment_mode || "open",
    members,
  };
}

function rulesFromRow(row: TicketRow): MatchmakingRuleSet {
  return {
    id: row.id,
    gameId: row.game_id,
    version: row.version,
    hardRules: row.hard_rules,
    softPreferences: row.soft_preferences,
    waitStrategy: row.wait_strategy,
  };
}

// A matcher tick gets one reservation attempt for a ticket. A normal
// contention result is durable state, not a reason to spin on the same
// candidate while other tickets are waiting.
const RESERVATION_CONFLICT_BUDGET = 1;
const CASUAL_BACKFILL_BUDGET = 1;

type ReservationKind = "pair" | "group";

type MatcherAttemptContext = {
  tickId: string;
  ticketId: string;
  startedAt: number;
  conflictCount: number;
  outcome: "NO_CANDIDATE" | "BUSINESS_CONFLICT" | "SUCCESS" | "WAITING" | "DATABASE_ERROR";
  reasonCode: string | null;
  targetId: string | null;
};

function createMatcherAttemptContext(tickId: string, ticketId: string): MatcherAttemptContext {
  return {
    tickId,
    ticketId,
    startedAt: Date.now(),
    conflictCount: 0,
    outcome: "NO_CANDIDATE",
    reasonCode: null,
    targetId: null,
  };
}

function recordBusinessConflict(context: MatcherAttemptContext, reasonCode: string, targetId?: string | null) {
  context.conflictCount += 1;
  context.outcome = "BUSINESS_CONFLICT";
  context.reasonCode = reasonCode;
  context.targetId = targetId || null;
  if (reasonCode === "STALE_CANDIDATE") incrementRuntimeMetric("stale_candidate");
  if (reasonCode === "GROUP_FULL") incrementRuntimeMetric("group_full");
  if (reasonCode === "ROOM_LOCKED") incrementRuntimeMetric("room_locked");
  recordMatcherEvent({
    tickId: context.tickId,
    ticketId: context.ticketId,
    candidateId: targetId || null,
    operation: "reserve",
    outcome: "BUSINESS_CONFLICT",
    reasonCode,
    attemptNumber: context.conflictCount,
  });
}

type ReservationMetricBucket = {
  minute: string;
  reserveAttempts: number;
  pairConflicts: number;
  groupConflicts: number;
};

let reservationMetricBucket: ReservationMetricBucket | null = null;

function currentMetricMinute() {
  return new Date().toISOString().slice(0, 16);
}

function flushReservationMetrics(nextMinute: string) {
  if (reservationMetricBucket && reservationMetricBucket.minute !== nextMinute && reservationMetricBucket.reserveAttempts > 0) {
    console.info(JSON.stringify({
      event: "matchmaking_reservation_metrics",
      window_start: `${reservationMetricBucket.minute}:00Z`,
      reserve_attempts: reservationMetricBucket.reserveAttempts,
      pair_conflicts: reservationMetricBucket.pairConflicts,
      group_conflicts: reservationMetricBucket.groupConflicts,
      conflict_budget: RESERVATION_CONFLICT_BUDGET,
    }));
  }
  if (!reservationMetricBucket || reservationMetricBucket.minute !== nextMinute) {
    reservationMetricBucket = {
      minute: nextMinute,
      reserveAttempts: 0,
      pairConflicts: 0,
      groupConflicts: 0,
    };
  }
}

function recordReservationAttempt(kind?: ReservationKind) {
  const minute = currentMetricMinute();
  flushReservationMetrics(minute);
  if (!reservationMetricBucket) return;
  reservationMetricBucket.reserveAttempts += 1;
  if (kind === "pair") incrementRuntimeMetric("pair_attempts");
  if (kind === "group") incrementRuntimeMetric("group_attempts");
}

function recordReservationConflict(kind: ReservationKind) {
  const minute = currentMetricMinute();
  flushReservationMetrics(minute);
  if (!reservationMetricBucket) return;
  if (kind === "pair") reservationMetricBucket.pairConflicts += 1;
  if (kind === "group") reservationMetricBucket.groupConflicts += 1;
  incrementRuntimeMetric(kind === "pair" ? "pair_business_conflicts" : "group_business_conflicts");
}

function hasReservationConflictReason(data: any, reasons: string[]) {
  return data?.ok === false && reasons.includes(data?.reason);
}

function isPairReservationConflict(error: any, data?: any) {
  // Business contention must be a committed typed result. A legacy exception
  // carrying SQLSTATE 40001 is deliberately not accepted as a business miss.
  return hasReservationConflictReason(data, ["MATCH_RESERVATION_CONFLICT"])
    || (String(error?.code || "") !== "40001" && error?.message?.includes("MATCH_RESERVATION_CONFLICT"));
}

function isGroupReservationConflict(error: any, data?: any) {
  return hasReservationConflictReason(data, ["GROUP_RESERVATION_CONFLICT", "GROUP_SIZE_CONFLICT"])
    || (String(error?.code || "") !== "40001" && error?.message?.includes("GROUP_RESERVATION_CONFLICT"))
    || (String(error?.code || "") !== "40001" && error?.message?.includes("GROUP_SIZE_CONFLICT"));
}

const matchmakingFlights = new Map<string, Promise<unknown>>();

const MATCHER_INTERVAL_MS = 2_000;
const MATCHER_INTERVAL_JITTER_MS = 500;
const MATCHER_FRESH_BATCH_SIZE = 16;
const MATCHER_REGULAR_BATCH_SIZE = 4;
const MATCHER_PROCESSING_CONCURRENCY = 2;
const MATCHER_FRESH_WINDOW_MS = 20_000;
const MATCHER_IDLE_COOLDOWN_MS = 5_000;
const MATCHER_WAITING_COOLDOWN_MS = 15_000;
const MATCHER_ERROR_COOLDOWN_MS = 30_000;
const MATCHER_ERROR_QUARANTINE_THRESHOLD = 3;
const MATCHER_ERROR_QUARANTINE_MS = 5 * 60_000;
let matcherHandle: ReturnType<typeof setTimeout> | null = null;
let matcherTelemetryHandle: ReturnType<typeof setInterval> | null = null;
let matcherBusy = false;
let lastPoolGaugeAt = 0;

function cooldownForAttempt(context: MatcherAttemptContext, previousConflicts: number, previousErrors: number) {
  if (context.outcome === "BUSINESS_CONFLICT") {
    const exponent = Math.min(5, Math.max(0, previousConflicts));
    return Math.min(30_000, 1_000 * (2 ** exponent)) + Math.floor(Math.random() * 500);
  }
  if (context.outcome === "WAITING") return MATCHER_WAITING_COOLDOWN_MS;
  if (context.outcome === "DATABASE_ERROR") {
    const errors = previousErrors + 1;
    if (errors >= MATCHER_ERROR_QUARANTINE_THRESHOLD) return MATCHER_ERROR_QUARANTINE_MS;
    return MATCHER_ERROR_COOLDOWN_MS * errors;
  }
  return MATCHER_IDLE_COOLDOWN_MS + Math.floor(Math.random() * 1_000);
}

async function persistMatchAttemptState(sourceRow: TicketRow, context: MatcherAttemptContext) {
  if (!sourceRow.id || sourceRow.state !== "searching") return;
  const previousConflicts = Number(sourceRow.consecutive_conflicts || 0);
  const previousErrors = Number(sourceRow.consecutive_match_errors || 0);
  const cooldownMs = cooldownForAttempt(context, previousConflicts, previousErrors);
  const consecutiveConflicts = context.outcome === "BUSINESS_CONFLICT" ? previousConflicts + 1 : 0;
  const consecutiveErrors = context.outcome === "DATABASE_ERROR" ? previousErrors + 1 : 0;
  const quarantined = consecutiveErrors >= MATCHER_ERROR_QUARANTINE_THRESHOLD;
  const nextAttemptAt = new Date(Date.now() + cooldownMs).toISOString();
  const { error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    .update({
      last_match_attempt_at: new Date().toISOString(),
      next_match_attempt_at: nextAttemptAt,
      last_match_outcome: context.outcome,
      last_match_target_id: context.targetId,
      consecutive_conflicts: consecutiveConflicts,
      consecutive_match_errors: consecutiveErrors,
      matcher_quarantined_at: quarantined ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceRow.id)
    .eq("state", "searching");
  if (error) throw error;
  if (context.outcome === "BUSINESS_CONFLICT") {
    incrementRuntimeMetric("matcher_backoffs");
    recordMatcherEvent({
      tickId: context.tickId,
      ticketId: context.ticketId,
      candidateId: context.targetId,
      operation: "schedule_next_attempt",
      outcome: "COOLDOWN",
      reasonCode: context.reasonCode,
      attemptNumber: consecutiveConflicts,
      cooldownMs,
    });
  }
  if (quarantined) {
    recordMatcherEvent({
      tickId: context.tickId,
      ticketId: context.ticketId,
      operation: "schedule_next_attempt",
      outcome: "QUARANTINED",
      reasonCode: context.reasonCode || "DATABASE_ERROR",
      attemptNumber: consecutiveErrors,
      cooldownMs,
    });
  }
}

async function refreshMatcherPoolGauges() {
  if (Date.now() - lastPoolGaugeAt < 10_000) return;
  lastPoolGaugeAt = Date.now();
  const admin = supabaseAdmin();
  const [{ count: searching }, { count: forming }] = await Promise.all([
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching"),
    admin.from("matchmaking_groups").select("id", { count: "exact", head: true }).in("state", ["forming", "backfilling"]),
  ]);
  setGauge("searching_tickets", Number(searching || 0));
  setGauge("forming_rooms", Number(forming || 0));
}

async function runMatcherBatch(rows: TicketRow[], tickId: string) {
  let cursor = 0;
  const processRow = async (row: TicketRow) => {
    const context = createMatcherAttemptContext(tickId, row.id);
    recordTicketProcessed(row.id);
    const startedAt = Date.now();
    try {
      const result = await withMatchmakingFlight(row.user_id, () => row.mode === "casual"
        ? attemptCasualGroup(row.user_id, context)
        : attemptMatch(row.user_id, context));
      if (result?.state && result.state !== "searching") {
        context.outcome = "SUCCESS";
      } else if (context.outcome === "NO_CANDIDATE" && row.mode === "casual" && result?.group_id) {
        context.outcome = "WAITING";
      }
      await persistMatchAttemptState(row, context);
      observeLatency("matchmaking_start", Date.now() - startedAt);
    } catch (error) {
      context.outcome = "DATABASE_ERROR";
      context.reasonCode = isActualSqlSerializationFailure(error) ? "DATABASE_SERIALIZATION_FAILURE" : "DATABASE_ERROR";
      if (isActualSqlSerializationFailure(error)) incrementRuntimeMetric("actual_sql_40001");
      if (isDatabaseTimeout(error)) incrementRuntimeMetric("transaction_timeouts");
      incrementRuntimeMetric("database_errors");
      recordMatcherEvent({
        tickId,
        ticketId: row.id,
        operation: "matchmaking_attempt",
        outcome: isActualSqlSerializationFailure(error) ? "SQL_SERIALIZATION_FAILURE" : isDatabaseTimeout(error) ? "TIMEOUT" : "DATABASE_ERROR",
        reasonCode: context.reasonCode,
      });
      try { await persistMatchAttemptState(row, context); } catch (persistError) {
        console.warn(JSON.stringify({ event: "matchmaking_attempt_state_error", message: persistError instanceof Error ? persistError.message : String(persistError) }));
      }
    }
  };
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      if (row) await processRow(row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MATCHER_PROCESSING_CONCURRENCY, rows.length) }, worker));
}

async function runMatchmakingSweep() {
  if (matcherBusy) return;
  matcherBusy = true;
  const tickId = nextMatcherTick();
  try {
    if (!(await claimMatcherLease())) return;
    markActiveTick();
    await refreshMatcherPoolGauges();
    if (matcherCircuitOpen()) return;
    const eligibleAt = new Date().toISOString();
    const freshSince = new Date(Date.now() - MATCHER_FRESH_WINDOW_MS).toISOString();
    const select = "id,user_id,mode,state,next_match_attempt_at,consecutive_conflicts,consecutive_match_errors,matcher_wake_at";
    const { data: freshRows, error: freshError } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select(select)
      .eq("state", "searching")
      .or(`next_match_attempt_at.is.null,next_match_attempt_at.lte.${eligibleAt}`)
      .gte("matcher_wake_at", freshSince)
      .order("matcher_wake_at", { ascending: false })
      .limit(MATCHER_FRESH_BATCH_SIZE);
    if (freshError) throw freshError;
    const { data: regularRows, error: regularError } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select(select)
      .eq("state", "searching")
      .or(`next_match_attempt_at.is.null,next_match_attempt_at.lte.${eligibleAt}`)
      .or(`matcher_wake_at.is.null,matcher_wake_at.lt.${freshSince}`)
      .order("search_started_at", { ascending: true })
      .limit(MATCHER_REGULAR_BATCH_SIZE);
    if (regularError) throw regularError;
    const rows = [...(freshRows || []), ...(regularRows || [])];
    setGauge("eligible_tickets", rows.length);
    await runMatcherBatch(rows as TicketRow[], tickId);
  } catch (error) {
    incrementRuntimeMetric("database_errors");
    console.warn(JSON.stringify({
      event: "matchmaking_sweep_error",
      message: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    matcherBusy = false;
  }
}

/**
 * A deliberately small in-process matcher. Active tickets are durable rows,
 * so a restart simply resumes from the next sweep. Existing reservation RPCs
 * provide the database-side idempotency and conflict boundary.
 */
export function startPersistentMatcher() {
  if (matcherHandle) return;
  const scheduleNextSweep = (delayMs: number) => {
    matcherHandle = setTimeout(() => {
      void runMatchmakingSweep().finally(() => {
        scheduleNextSweep(MATCHER_INTERVAL_MS + Math.floor(Math.random() * MATCHER_INTERVAL_JITTER_MS));
      });
    }, delayMs);
    matcherHandle.unref?.();
  };
  scheduleNextSweep(0);
  matcherTelemetryHandle = setInterval(() => { void flushMatcherTelemetry(); }, 10_000);
  matcherTelemetryHandle.unref?.();
}

function withMatchmakingFlight<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const running = matchmakingFlights.get(userId);
  if (running) return running as Promise<T>;

  const flight = Promise.resolve().then(work).finally(() => {
    if (matchmakingFlights.get(userId) === flight) matchmakingFlights.delete(userId);
  });
  matchmakingFlights.set(userId, flight);
  return flight;
}

async function activeTicketRow(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    .select("*")
    .eq("user_id", userId)
    .in("state", ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const ticket = data as TicketRow | null;
  if (!ticket) return null;
  // ticket.expires_at is intentionally ignored. Active rows are closed only
  // by an explicit cancel/leave/offline action.
  return ticket;
}

async function attemptMatch(userId: string, context?: MatcherAttemptContext) {
  const admin = supabaseAdmin();
  const sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.state !== "searching") return sourceRow;

  const { data: ruleRow, error: ruleError } = await admin
    .from("matchmaking_rule_sets")
    .select("*")
    .eq("id", sourceRow.rule_set_id)
    .single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");

  const { data: waitingRows, error: waitingError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("game_id", sourceRow.game_id)
    .eq("state", "searching")
    .neq("user_id", userId)
    .order("search_started_at", { ascending: true })
    .limit(100);
  if (waitingError) throw waitingError;

  const source = ticketFromRow(sourceRow);
  const rules = rulesFromRow(ruleRow);
  const cooldownSeconds = Math.max(0, Number(rules.waitStrategy.rejectedPairCooldownSeconds || 0));
  const excludedUsers = new Set<string>();
  if (cooldownSeconds > 0) {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
    const { data: recentRejected } = await admin
      .from("matchmaking_pairs")
      .select("user_a_id,user_b_id")
      .in("state", ["cancelled", "expired"])
      // A timeout often means a dropped/slow connection, not an intentional
      // rejection. Let those two players meet again immediately; only a clear
      // rejection starts the short pair cooldown.
      .eq("cancel_reason", "rejected")
      .gte("updated_at", cutoff)
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
    for (const pair of recentRejected || []) {
      excludedUsers.add(pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id);
    }
  }
  const ranked = rankCandidates(
    source,
    (waitingRows || []).map(ticketFromRow).filter((ticket) => !excludedUsers.has(ticket.userId)),
    rules
  );
  let conflictCount = 0;
  for (const candidate of ranked) {
    if (conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
    if (context?.targetId && context.targetId === candidate.ticket.id) {
      incrementRuntimeMetric("same_target_suppressed");
      continue;
    }
    const compatibility = evaluateCompatibility(source, candidate.ticket, rules);
    recordReservationAttempt("pair");
    const { data: pair, error } = await admin.rpc("matchmaking_reserve_pair", {
      p_ticket_a: source.id,
      p_ticket_b: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: compatibility.softSignals,
    });
    if (error || isPairReservationConflict(null, pair)) {
      if (isPairReservationConflict(error, pair)) {
        conflictCount += 1;
        if (context) recordBusinessConflict(context, "MATCH_RESERVATION_CONFLICT", candidate.ticket.id);
        recordReservationConflict("pair");
        continue;
      }
      throw error;
    }
    if (context) {
      context.outcome = "SUCCESS";
      context.reasonCode = null;
      context.targetId = candidate.ticket.id;
      observeLatency("time_to_pair", Date.now() - context.startedAt);
      observeLatency("time_to_first_match", Date.now() - context.startedAt);
    }
    incrementRuntimeMetric("pair_success");
    if (!["matched", "playing"].includes(String(pair.state))) {
      const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
      if (presentError) throw presentError;
    }
    // Ranked pairs are direct connections: once a compatible second player
    // enters the pair, both tickets are accepted server-side and the room is
    // created atomically. The confirmation rows remain as an audit trail, but
    // neither player needs to click a second consent button.
    if (!["matched", "playing"].includes(String(pair.state))) await autoConnectPair(pair.id, requestIdForAutoConnect(source.id, candidate.ticket.id));
    break;
  }
  return activeTicketRow(userId);
}

function requestIdForAutoConnect(ticketA: string, ticketB: string) {
  return `auto-pair:${ticketA}:${ticketB}`;
}

async function autoConnectPair(pairId: string, requestId: string | null = null) {
  const admin = supabaseAdmin();
  const { data: pair, error: pairError } = await admin
    .from("matchmaking_pairs")
    .select("id,user_a_id,user_b_id,state")
    .eq("id", pairId)
    .maybeSingle();
  if (pairError) throw pairError;
  if (!pair || ["playing", "matched", "completed"].includes(pair.state)) return pair;
  if (pair.state !== "waiting_confirmation") return pair;

  for (const userId of [pair.user_a_id, pair.user_b_id]) {
    const { error } = await admin.rpc("matchmaking_confirm_pair", {
      p_pair_id: pair.id,
      p_user_id: userId,
      p_decision: "accepted",
      p_request_id: `${requestId || `auto-pair:${pair.id}`}:${userId}`,
    });
    if (error) throw error;
  }
  return pair;
}

export async function previewOpsRankedMatch(userA: string, userB: string) {
  if (!userA || !userB || userA === userB) throw new AppError("OPS_MATCH_INPUT_INVALID", "请选择两位不同的玩家", 422, false);
  const [ticketA, ticketB] = await Promise.all([activeTicketRow(userA), activeTicketRow(userB)]);
  if (!ticketA || !ticketB || ticketA.mode !== "ranked" || ticketB.mode !== "ranked") {
    throw new AppError("OPS_MATCH_UNAVAILABLE", "两位玩家必须都在 Ranked 匹配池中", 409, true);
  }
  const { data: ruleRow, error } = await supabaseAdmin().from("matchmaking_rule_sets").select("*").eq("id", ticketA.rule_set_id).maybeSingle();
  if (error || !ruleRow) throw error || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  const compatibility = evaluateCompatibility(ticketFromRow(ticketA), ticketFromRow(ticketB), rulesFromRow(ruleRow));
  return { ticketA, ticketB, compatibility };
}

export async function forceOpsRankedMatch(userA: string, userB: string, reason: string, requestId: string) {
  const preview = await previewOpsRankedMatch(userA, userB);
  if (!preview.compatibility.compatible) {
    throw new AppError("OPS_MATCH_INCOMPATIBLE", "两位玩家当前不满足 Ranked 匹配规则", 409, false);
  }
  const { data: pair, error } = await supabaseAdmin().rpc("matchmaking_reserve_pair", {
    p_ticket_a: preview.ticketA.id,
    p_ticket_b: preview.ticketB.id,
    p_hard_snapshot: { passed: true, source: "ops_v2", reason: reason.slice(0, 200) },
    p_soft_snapshot: { ...preview.compatibility.softSignals, source: "ops_v2" },
  });
  if (isPairReservationConflict(error, pair)) throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请刷新后重试", 409, true);
  if (error || !pair?.id) throw error || new AppError("OPS_MATCH_FAILED", "人工匹配未能生成 Pair", 500, true);
  if (!["matched", "playing"].includes(String(pair.state))) {
    const { error: presentError } = await supabaseAdmin().rpc("matchmaking_present_pair", { p_pair_id: pair.id });
    if (presentError) throw presentError;
    await autoConnectPair(pair.id, `ops-v2:${requestId}`);
  }
  // Reservation can precede automatic confirmation. Read the canonical pair
  // once that lifecycle path completes so the operator audit is attached to
  // the real Room rather than a stale pre-connect RPC snapshot.
  const { data: connectedPair, error: connectedPairError } = await supabaseAdmin()
    .from("matchmaking_pairs")
    .select("room_id")
    .eq("id", pair.id)
    .maybeSingle();
  if (connectedPairError) throw connectedPairError;
  return { pairId: pair.id, roomId: connectedPair?.room_id || pair.room_id || null, status: "matched" };
}

export async function previewOpsCasualAttach(userId: string, groupId: string) {
  const admin = supabaseAdmin();
  const [ticket, groupResult] = await Promise.all([
    activeTicketRow(userId),
    admin.from("matchmaking_groups").select("*").eq("id", groupId).maybeSingle(),
  ]);
  if (groupResult.error) throw groupResult.error;
  const group = groupResult.data as TicketRow | null;
  if (!ticket || ticket.mode !== "casual" || ticket.state !== "searching" || !group || !["forming", "backfilling", "searching", "partial_ready"].includes(group.state)) {
    throw new AppError("OPS_CASUAL_ATTACH_UNAVAILABLE", "玩家或休闲 Room 已不在可招募状态", 409, true);
  }
  const { count, error: countError } = await admin.from("matchmaking_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).neq("decision", "rejected");
  if (countError) throw countError;
  if (Number(count || 0) >= Number(group.hard_max_players || 6)) throw new AppError("GROUP_FULL", "休闲 Room 已满员", 409, false);
  const { data: ownerTicket, error: ownerError } = await admin.from("matchmaking_tickets").select("*").eq("group_id", groupId).eq("user_id", group.owner_user_id).maybeSingle();
  if (ownerError || !ownerTicket) throw ownerError || new AppError("OPS_CASUAL_OWNER_TICKET_MISSING", "休闲 Room 缺少有效 Owner Ticket", 409, true);
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", ownerTicket.rule_set_id).maybeSingle();
  if (ruleError || !ruleRow) throw ruleError || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  return { ticket, group, compatibility: evaluateCompatibility(ticketFromRow(ownerTicket), ticketFromRow(ticket), rulesFromRow(ruleRow)), rules: rulesFromRow(ruleRow) };
}

export async function forceOpsCasualAttach(userId: string, groupId: string, reason: string) {
  const preview = await previewOpsCasualAttach(userId, groupId);
  if (!preview.compatibility.compatible) throw new AppError("OPS_CASUAL_ATTACH_INCOMPATIBLE", "玩家不满足当前休闲 Room 的匹配规则", 409, false);
  const { data, error } = await supabaseAdmin().rpc("matchmaking_reserve_group_member", {
    p_group_id: groupId,
    p_ticket_id: preview.ticket.id,
    p_hard_snapshot: { passed: true, source: "ops_v2", reason: reason.slice(0, 200), ruleSetVersion: preview.rules.version },
    p_soft_snapshot: { ...preview.compatibility.softSignals, source: "ops_v2" },
  });
  if (isGroupReservationConflict(error, data)) throw new AppError("GROUP_RESERVATION_CONFLICT", "休闲 Room 刚刚发生变化，请刷新后重试", 409, true);
  if (error) throw error;
  return { groupId, roomId: data?.room_id || preview.group.room_id || null, status: "attached" };
}

export async function forceOpsCasualLock(groupId: string, reason: string, requestId: string) {
  const admin = supabaseAdmin();
  const { data: group, error: groupError } = await admin
    .from("matchmaking_groups")
    .select("id,owner_user_id,state,room_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError || !group) throw groupError || new AppError("OPS_CASUAL_LOCK_UNAVAILABLE", "休闲 Room 已不存在", 409, true);
  if (!["forming", "backfilling", "searching", "partial_ready"].includes(String(group.state))) {
    throw new AppError("OPS_CASUAL_LOCK_UNAVAILABLE", "休闲 Room 已不在可停止招募状态", 409, true);
  }
  const { data, error } = await admin.rpc("matchmaking_lock_forming_group", {
    p_group_id: groupId,
    p_user_id: group.owner_user_id,
    p_request_id: `ops-v2:${requestId}:${reason.slice(0, 64)}`,
  });
  if (error) throw error;
  return { groupId, roomId: data?.room_id || group.room_id || null, status: "locked" };
}

async function groupSnapshot(groupId: string, viewerId: string) {
  const admin = supabaseAdmin();
  const { data: groupRow, error: groupError } = await admin.from("matchmaking_groups").select("*").eq("id", groupId).maybeSingle();
  if (groupError) throw groupError;
  if (!groupRow) return null;
  const { data: memberRows, error: memberError } = await admin
    .from("matchmaking_group_members")
    .select("group_id,ticket_id,user_id,is_owner,decision,joined_at,responded_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (memberError) throw memberError;
  const members = (memberRows || []) as TicketRow[];
  const ticketIds = members.map((member) => member.ticket_id).filter(Boolean);
  const { data: memberTickets, error: ticketError } = ticketIds.length
    ? await admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").in("id", ticketIds)
    : { data: [], error: null };
  if (ticketError) throw ticketError;
  const ticketById = new Map((memberTickets || []).map((ticket) => [ticket.id, ticket]));
  const profiles = await publicProfilesFor(members.map((member) => member.user_id));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const group = groupFromRow(groupRow, members.map((member) => ({
    userId: member.user_id,
    ticketId: member.ticket_id,
    isOwner: Boolean(member.is_owner),
    decision: member.decision || "pending",
    joinedAt: member.joined_at,
    respondedAt: member.responded_at || null,
    rankCode: ticketById.get(member.ticket_id)?.rank_code || null,
    microphonePreference: ticketById.get(member.ticket_id)?.microphone_preference || "any",
    mode: ticketById.get(member.ticket_id)?.mode || "casual",
    profile: profileById.get(member.user_id) || null,
  })));
  if (group.roomId) {
    const { data: room } = await admin.from("rooms").select("code,formation_state").eq("id", group.roomId).maybeSingle();
    group.roomCode = room?.code || null;
    group.roomPhase = room?.formation_state || null;
  }
  return group.members.some((member) => member.userId === viewerId) ? group : null;
}

async function attemptCasualGroup(userId: string, context?: MatcherAttemptContext) {
  const admin = supabaseAdmin();
  let sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.mode !== "casual") return sourceRow;
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", sourceRow.rule_set_id).single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");
  const rules = rulesFromRow(ruleRow);
  const source = ticketFromRow(sourceRow);

  // A non-owner already inside a forming room waits for the owner (or another
  // sweep) to backfill it. The owner remains searchable and drives the room.
  let ownGroup: TicketRow | null = null;
  if (sourceRow.group_id) {
    const { data: group } = await admin.from("matchmaking_groups").select("*").eq("id", sourceRow.group_id).maybeSingle();
    ownGroup = group as TicketRow | null;
    if (ownGroup && ownGroup.owner_user_id !== userId) {
      if (context) context.outcome = "WAITING";
      return sourceRow;
    }
    if (ownGroup && !["searching", "partial_ready", "forming", "backfilling"].includes(ownGroup.state)) return sourceRow;
  }

  // A new starter first tries existing groups. This is the only operation that
  // changes the candidate's group; the RPC performs the row-lock boundary.
  if (!ownGroup && sourceRow.state === "searching") {
    const { data: openGroups, error: openGroupError } = await admin
      .from("matchmaking_groups")
      .select("*")
      .eq("game_id", source.gameId)
      .in("state", ["searching", "partial_ready", "forming", "backfilling"])
      .neq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(24);
    if (openGroupError) throw openGroupError;
    let conflictCount = 0;
    for (const groupRow of (openGroups || []) as TicketRow[]) {
      if (conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
      const { count } = await admin.from("matchmaking_group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupRow.id).neq("decision", "rejected");
      if (Number(count || 0) >= Number(groupRow.hard_max_players || 6)) {
        incrementRuntimeMetric("group_full");
        continue;
      }
      const { data: ownerRow } = await admin.from("matchmaking_tickets")
        .select("*").eq("group_id", groupRow.id)
        .eq("user_id", groupRow.owner_user_id).maybeSingle();
      if (!ownerRow) continue;
      const ownerTicket = ticketFromRow(ownerRow);
      const candidate = rankCandidates(ownerTicket, [source], rules)[0];
      if (!candidate) continue;
      recordReservationAttempt("group");
      const { data: reservation, error } = await admin.rpc("matchmaking_reserve_group_member", {
        p_group_id: groupRow.id,
        p_ticket_id: source.id,
        p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
        p_soft_snapshot: candidate.compatibility.softSignals,
      });
      if (!error && !isGroupReservationConflict(null, reservation)) {
        if (context) {
          context.outcome = "SUCCESS";
          context.reasonCode = null;
          context.targetId = source.id;
          observeLatency("time_to_forming_room", Date.now() - context.startedAt);
          observeLatency("time_to_first_match", Date.now() - context.startedAt);
        }
        incrementRuntimeMetric("group_success");
        return activeTicketRow(userId);
      }
      if (!isGroupReservationConflict(error, reservation)) throw error;
      conflictCount += 1;
      if (context) recordBusinessConflict(context, String(reservation?.reason || "GROUP_RESERVATION_CONFLICT"), groupRow.id);
      recordReservationConflict("group");
    }

    if (conflictCount >= RESERVATION_CONFLICT_BUDGET) return activeTicketRow(userId);

    if (!sourceRow.group_id) {
      const { error: groupError } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: source.id });
      if (groupError) throw groupError;
      sourceRow = await activeTicketRow(userId);
      if (!sourceRow?.group_id) return sourceRow;
      const { data: group } = await admin.from("matchmaking_groups").select("*").eq("id", sourceRow.group_id).maybeSingle();
      ownGroup = group as TicketRow | null;
    }
  }

  if (!ownGroup || ownGroup.owner_user_id !== userId || !["searching", "partial_ready", "forming", "backfilling"].includes(ownGroup.state)) {
    return activeTicketRow(userId);
  }

  const { data: candidates, error: candidatesError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("game_id", source.gameId)
    .eq("mode", "casual")
    .eq("state", "searching")
    .neq("user_id", userId)
    .order("search_started_at", { ascending: true })
    .limit(100);
  if (candidatesError) throw candidatesError;
  // Two one-person placeholder groups must not try to absorb each other in
  // opposite directions. A stable UUID order gives one owner the merge right;
  // tickets without a group remain eligible for ordinary backfill.
  const eligibleCandidates = (candidates || [])
    .map(ticketFromRow)
    .filter((candidate) => !candidate.groupId || String(ownGroup.id) < String(candidate.groupId));
  const ranked = rankCandidates(source, eligibleCandidates, rules);
  let conflictCount = 0;
  let accepted = 0;
  for (const candidate of ranked) {
    if (accepted >= CASUAL_BACKFILL_BUDGET || conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
    if (context?.targetId && context.targetId === candidate.ticket.id) {
      incrementRuntimeMetric("same_target_suppressed");
      continue;
    }
    recordReservationAttempt("group");
    incrementRuntimeMetric("backfill_attempts");
    const { data: reservation, error } = await admin.rpc("matchmaking_reserve_group_member", {
      p_group_id: ownGroup.id,
      p_ticket_id: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: candidate.compatibility.softSignals,
    });
    if (!error && !isGroupReservationConflict(null, reservation)) {
      accepted += 1;
      incrementRuntimeMetric("group_success");
      incrementRuntimeMetric("backfill_success");
      if (context) {
        context.outcome = "SUCCESS";
        context.reasonCode = null;
        context.targetId = candidate.ticket.id;
        observeLatency("backfill_latency", Date.now() - context.startedAt);
      }
      if (["matched", "playing"].includes(reservation?.state)) break;
      continue;
    }
    if (!isGroupReservationConflict(error, reservation)) throw error;
    conflictCount += 1;
    if (context) recordBusinessConflict(context, String(reservation?.reason || "GROUP_RESERVATION_CONFLICT"), candidate.ticket.id);
    recordReservationConflict("group");
  }
  return activeTicketRow(userId);
}

async function startTicketInternal(userId: string, input: MatchmakingInput, requestId: string | null) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (error) throw error;
  // Starting a ticket is a Room-entry mutation, not a synchronous matching
  // request. The RPC has already created/resolved the waiting Room; return its
  // ticket envelope now and let the persistent matcher own candidate attempts
  // in the background.
  if (data?.reused) return startTicketSnapshot(data);
  if (data?.id) {
    const currentMetadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const { error: metadataError } = await admin
      .from("matchmaking_tickets")
      .update({
        metadata: {
          ...currentMetadata,
          ownRoles: input.ownRoles || [],
          teammateRoles: input.teammateRoles || [],
          preferredTotalPlayers: input.preferredTotalPlayers,
        },
        // Search tickets remain active until the player explicitly cancels
        // or leaves the site. This is deliberately not a lease.
        expires_at: "infinity",
      })
      .eq("id", data.id);
    if (metadataError) throw metadataError;
  }
  return startTicketSnapshot(data);
}

function startTicketSnapshot(data: TicketRow) {
  const { roomCode, reused, ...ticket } = data || {};
  return {
    ticket: { ...ticket, roomCode: roomCode || ticket.roomCode || null },
    pair: null,
    group: null,
    candidate: null,
  };
}

export function startTicket(userId: string, input: MatchmakingInput, requestId: string | null) {
  return withMatchmakingFlight(userId, () => startTicketInternal(userId, input, requestId));
}

/**
 * Join one of the privacy-safe public matchmaking entries directly. The
 * target ticket is revalidated and reserved atomically by the existing pair /
 * group RPCs, so a stale card cannot create a ghost ticket or bypass the
 * normal hard compatibility rules.
 */
async function joinPublicTicketInternal(userId: string, targetTicketId: string, requestId: string | null) {
  const admin = supabaseAdmin();
  const active = await activeTicketRow(userId);
  if (active) {
    // A retried request with the same idempotency key may arrive after the
    // first reservation committed. Return the live snapshot instead of
    // manufacturing another ticket; a different request remains a conflict.
    if (requestId && active.request_id === requestId) return matchmakingStatus(userId);
    throw new AppError("MATCH_ALREADY_ACTIVE", "你已经在匹配中，请先退出当前匹配", 409);
  }

  const { data: targetRow, error: targetError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("id", targetTicketId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow || targetRow.user_id === userId
      || targetRow.state !== "searching") {
    throw new AppError("DIRECT_JOIN_UNAVAILABLE", "这位玩家刚刚离开匹配，请重新选择", 409, true);
  }

  const { data: ruleRow, error: ruleError } = await admin
    .from("matchmaking_rule_sets")
    .select("*")
    .eq("id", targetRow.rule_set_id)
    .single();
  if (ruleError || !ruleRow) throw ruleError || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  const rules = rulesFromRow(ruleRow);
  const target = ticketFromRow(targetRow);
  const input: MatchmakingInput = {
    gameId: target.gameId,
    mode: target.mode,
    rankCode: target.rankCode,
    desiredRoles: target.desiredRoles,
    ownRoles: [],
    teammateRoles: [],
    microphonePreference: target.microphonePreference,
    desiredTeammates: target.mode === "casual" ? target.desiredTeammates : undefined,
    minTeammates: target.mode === "casual" ? target.minTeammates : undefined,
  };
  const { data: createdTicket, error: createError } = await admin.rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (createError) throw createError;
  // The starter RPC reuses an existing ticket under a race. Never attach that
  // unrelated ticket to a public target; surface the same active-match guard.
  if (createdTicket?.reused) {
    throw new AppError("MATCH_ALREADY_ACTIVE", "你已经在匹配中，请先退出当前匹配", 409);
  }
  const joiner = ticketFromRow(createdTicket || {});
  if (!joiner.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
  const { error: joinerLeaseError } = await admin
    .from("matchmaking_tickets")
    .update({ expires_at: "infinity" })
    .eq("id", joiner.id);
  if (joinerLeaseError) throw joinerLeaseError;

  try {
    const rankedTarget = rankCandidates(target, [joiner], rules);
    if (!rankedTarget.length) {
      throw new AppError("DIRECT_JOIN_INCOMPATIBLE", "这位玩家的匹配条件刚刚发生变化，请重新选择", 409, true);
    }
    const compatibility = rankedTarget[0].compatibility;
    if (target.mode === "casual") {
      let groupId = target.groupId || null;
      if (!groupId) {
        const { data: group, error: groupError } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: target.id });
        if (groupError) throw groupError;
        groupId = group?.id || null;
      }
      if (!groupId) throw new AppError("DIRECT_JOIN_UNAVAILABLE", "这支队伍刚刚发生变化，请重新选择", 409, true);
      recordReservationAttempt("group");
      const { data: reservation, error: reserveError } = await admin.rpc("matchmaking_reserve_group_member", {
        p_group_id: groupId,
        p_ticket_id: joiner.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (isGroupReservationConflict(reserveError, reservation)) {
        recordReservationConflict("group");
        throw new AppError("GROUP_RESERVATION_CONFLICT", "这位玩家刚刚被其他队伍占用，请重新选择", 409, true);
      }
      if (reserveError) throw reserveError;
    } else {
      recordReservationAttempt("pair");
      const { data: pair, error: reserveError } = await admin.rpc("matchmaking_reserve_pair", {
        p_ticket_a: joiner.id,
        p_ticket_b: target.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (isPairReservationConflict(reserveError, pair)) {
        recordReservationConflict("pair");
        throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请重新选择", 409, true);
      }
      if (reserveError) throw reserveError;
      if (!pair?.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
      if (!["matched", "playing"].includes(String(pair.state))) {
        const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
        if (presentError) throw presentError;
        await autoConnectPair(pair.id, requestId ? `auto-join:${requestId}` : `auto-join:${pair.id}`);
      }
    }
  } catch (error) {
    await admin.rpc("matchmaking_cancel_ticket", {
      p_user_id: userId,
      p_reason: "direct_join_failed",
      p_request_id: requestId,
    });
    throw error;
  }

  return matchmakingStatus(userId);
}

export function joinPublicTicket(userId: string, targetTicketId: string, requestId: string | null) {
  return withMatchmakingFlight(userId, () => joinPublicTicketInternal(userId, targetTicketId, requestId));
}

export async function matchmakingStatus(userId: string) {
  const admin = supabaseAdmin();
  const ticket = await activeTicketRow(userId);

  const [{ count: matching }, { count: matchable }, { data: directoryRows }] = await Promise.all([
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching"),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("game_id", "deadlock"),
    admin
      .from("matchmaking_tickets")
      .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference,search_started_at")
      .eq("state", "searching")
      .eq("game_id", "deadlock")
      .neq("user_id", userId)
      .order("search_started_at", { ascending: true })
      .limit(8),
  ]);

  // This is a deliberately small, privacy-safe lobby preview. It reveals only
  // the preferences a player has already made public by entering the pool.
  const directoryTickets = (directoryRows || []) as TicketRow[];
  const directoryProfiles = await publicProfilesFor(directoryTickets.map((row) => row.user_id), { onlineOnly: true });
  const directoryProfileById = new Map(directoryProfiles.map((profile) => [profile.id, profile]));
  const directory = directoryTickets
    .filter((row) => directoryProfileById.has(row.user_id))
    .map((row) => ({
      ticketId: row.id,
      nickname: directoryProfileById.get(row.user_id)?.nickname || "玩家",
      gameId: row.game_id || "deadlock",
      mode: row.mode,
      rankCode: row.rank_code || null,
      desiredRoles: row.desired_roles || [],
      microphonePreference: row.microphone_preference || "any",
    }));

  if (!ticket) return { ticket: null, pair: null, group: null, candidate: null, matching: matching || 0, matchable: matchable || 0, directory };
  let ticketRoomCode: string | null = null;
  if (ticket.room_id) {
    const { data: room } = await admin.from("rooms").select("code").eq("id", ticket.room_id).maybeSingle();
    ticketRoomCode = room?.code || null;
  }
  let pair: TicketRow | null = null;
  let candidate = null;
  const group = ticket.group_id ? await groupSnapshot(ticket.group_id, userId) : null;
  if (ticket.pair_id) {
    const { data, error } = await admin.from("matchmaking_pairs").select("*").eq("id", ticket.pair_id).maybeSingle();
    if (error) throw error;
    pair = data;
    if (pair) {
      const candidateId = pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
      const candidateTicketId = pair.ticket_a_id === ticket?.id ? pair.ticket_b_id : pair.ticket_a_id;
      const [{ data: candidateTicket, error: candidateTicketError }, candidateProfiles] = await Promise.all([
        admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").eq("id", candidateTicketId).maybeSingle(),
        publicProfilesFor([candidateId]),
      ]);
      if (candidateTicketError) throw candidateTicketError;
      const candidateProfile = candidateProfiles[0] || null;
      candidate = candidateProfile ? {
        ...candidateProfile,
        rankCode: candidateTicket?.rank_code || null,
        microphonePreference: candidateTicket?.microphone_preference || "any",
        mode: candidateTicket?.mode || "ranked",
      } : null;
      const { data: confirmations } = await admin.from("matchmaking_confirmations").select("user_id,decision,responded_at").eq("pair_id", pair.id);
      let roomCode: string | null = null;
      if (pair.room_id) {
        const { data: room } = await admin.from("rooms").select("code").eq("id", pair.room_id).maybeSingle();
        roomCode = room?.code || null;
      }
      pair = { ...pair, confirmations: confirmations || [], roomCode };
    }
  }
  return { ticket: { ...ticket, roomCode: ticketRoomCode }, pair, group, candidate, matching: matching || 0, matchable: matchable || 0, directory };
}

async function cancelTicketInternal(userId: string, reason: string, requestId: string | null) {
  const active = await activeTicketRow(userId);
  if (active?.mode === "casual" && active.group_id) {
    const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_group", {
      p_user_id: userId,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error) throw error;
    await reconcileOrphanWaitingRooms(userId, requestId);
    return data;
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_ticket", {
    p_user_id: userId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) throw error;
  await reconcileOrphanWaitingRooms(userId, requestId);
  return data;
}

async function reconcileOrphanWaitingRooms(userId: string, requestId: string | null) {
  const { error } = await supabaseAdmin().rpc("reconcile_orphan_waiting_rooms", {
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) throw error;
}

export function cancelTicket(userId: string, reason: string, requestId: string | null) {
  return withMatchmakingFlight(userId, () => cancelTicketInternal(userId, reason, requestId));
}

/**
 * Leave a Room-first Room before a formal Session exists. The Room code is
 * checked against the user's current ticket/group backing so an old active
 * room_member row cannot be used to exit or mutate an unrelated Room.
 */
export async function exitPreSessionRoom(userId: string, roomId: string, requestId: string | null) {
  const admin = supabaseAdmin();
  const { data: activeMember, error: memberError } = await admin
    .from("room_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw memberError;
  if (!activeMember) throw new AppError("ROOM_NOT_ACTIVE", "你已不在这个房间中", 409);

  const ticket = await activeTicketRow(userId);
  if (!ticket) throw new AppError("ROOM_NOT_RESUMABLE", "这个房间已经结束，请重新开始", 409);

  let backedRoomId = ticket.room_id || null;
  if (!backedRoomId && ticket.group_id) {
    const { data: group, error: groupError } = await admin
      .from("matchmaking_groups")
      .select("room_id")
      .eq("id", ticket.group_id)
      .maybeSingle();
    if (groupError) throw groupError;
    backedRoomId = group?.room_id || null;
  }
  if (backedRoomId !== roomId) throw new AppError("ROOM_NOT_ACTIVE", "这个房间已经结束，请重新开始", 409);

  return cancelTicket(userId, "pre_session_room_exit", requestId);
}

async function confirmPairInternal(userId: string, pairId: string, decision: string, requestId: string | null) {
  if (!pairId || !["accepted", "rejected"].includes(decision)) {
    throw new AppError("CONFIRMATION_INVALID", "确认操作无效", 422);
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_confirm_pair", {
    p_pair_id: pairId,
    p_user_id: userId,
    p_decision: decision,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (data?.state === "cancelled") await attemptMatch(userId);
  return matchmakingStatus(userId);
}

export function confirmPair(userId: string, pairId: string, decision: string, requestId: string | null) {
  return withMatchmakingFlight(userId, () => confirmPairInternal(userId, pairId, decision, requestId));
}

async function startGroupInternal(userId: string, groupId: string, requestId: string | null) {
  if (!groupId) throw new AppError("GROUP_INVALID", "队伍信息无效", 422);
  const { data, error } = await supabaseAdmin().rpc("matchmaking_start_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) throw error;
  return matchmakingStatus(userId);
}

export function startGroup(userId: string, groupId: string, requestId: string | null) {
  return withMatchmakingFlight(userId, () => startGroupInternal(userId, groupId, requestId));
}

async function confirmGroupInternal(userId: string, groupId: string, decision: string, requestId: string | null) {
  if (!groupId || !["accepted", "rejected"].includes(decision)) {
    throw new AppError("CONFIRMATION_INVALID", "确认操作无效", 422);
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_confirm_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_decision: decision,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (data?.state === "partial_ready") await attemptCasualGroup(userId);
  return matchmakingStatus(userId);
}

export function confirmGroup(userId: string, groupId: string, decision: string, requestId: string | null) {
  return withMatchmakingFlight(userId, () => confirmGroupInternal(userId, groupId, decision, requestId));
}

export async function submitMatchFeedback(userId: string, body: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin().rpc("matchmaking_submit_feedback", {
    p_pair_id: String(body.pairId || ""),
    p_user_id: userId,
    p_did_play: body.didPlay === true,
    p_rating: body.rating || null,
    p_want_again: typeof body.wantAgain === "boolean" ? body.wantAgain : null,
    p_tags: Array.isArray(body.tags) ? body.tags : [],
    p_note: String(body.note || ""),
  });
  if (error) throw error;
  return data;
}
