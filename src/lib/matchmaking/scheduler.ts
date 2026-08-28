import { supabaseAdmin } from "../supabase";
import {
  createMatcherAttemptContext,
  type MatcherAttemptContext,
  type MatcherAttemptOutcome,
} from "./attempt-context";
import type { MatchMode, MatchState } from "./types";
import {
  claimMatcherLease,
  flushMatcherTelemetry,
  increment as incrementRuntimeMetric,
  markActiveTick,
  matcherCircuitOpen,
  nextMatcherTick,
  observeLatency,
  recordMatcherEvent,
  recordTicketProcessed,
  setGauge,
} from "./runtime-telemetry";

type SchedulerTicketRow = Record<string, any> & {
  id: string;
  user_id: string;
  mode: MatchMode;
  state: MatchState;
};
type MatcherProcessResult = Record<string, any> | null | undefined;
type MatcherProcessTicket = (row: SchedulerTicketRow, context: MatcherAttemptContext) => Promise<MatcherProcessResult>;

export const MATCHER_SCHEDULER_POLICY = Object.freeze({
  intervalMs: 2_000,
  intervalJitterMs: 500,
  freshBatchSize: 16,
  regularBatchSize: 4,
  processingConcurrency: 2,
  freshWindowMs: 20_000,
  idleCooldownMs: 5_000,
  waitingCooldownMs: 15_000,
  errorCooldownMs: 30_000,
  errorQuarantineThreshold: 3,
  errorQuarantineMs: 5 * 60_000,
});

let matcherHandle: ReturnType<typeof setTimeout> | null = null;
let matcherTelemetryHandle: ReturnType<typeof setInterval> | null = null;
let matcherBusy = false;
let lastPoolGaugeAt = 0;

export function nextMatcherCooldownMs(
  outcome: MatcherAttemptOutcome,
  previousConflicts: number,
  previousErrors: number,
  random: () => number = Math.random,
) {
  if (outcome === "BUSINESS_CONFLICT") {
    const exponent = Math.min(5, Math.max(0, previousConflicts));
    return Math.min(30_000, 1_000 * (2 ** exponent)) + Math.floor(random() * MATCHER_SCHEDULER_POLICY.intervalJitterMs);
  }
  if (outcome === "WAITING") return MATCHER_SCHEDULER_POLICY.waitingCooldownMs;
  if (outcome === "DATABASE_ERROR") {
    const errors = previousErrors + 1;
    if (errors >= MATCHER_SCHEDULER_POLICY.errorQuarantineThreshold) return MATCHER_SCHEDULER_POLICY.errorQuarantineMs;
    return MATCHER_SCHEDULER_POLICY.errorCooldownMs * errors;
  }
  return MATCHER_SCHEDULER_POLICY.idleCooldownMs + Math.floor(random() * 1_000);
}

export function nextMatcherIntervalMs(random: () => number = Math.random) {
  return MATCHER_SCHEDULER_POLICY.intervalMs
    + Math.floor(random() * MATCHER_SCHEDULER_POLICY.intervalJitterMs);
}

export function buildMatchAttemptState(
  sourceRow: SchedulerTicketRow,
  context: MatcherAttemptContext,
  now = Date.now(),
  random: () => number = Math.random,
) {
  const previousConflicts = Number(sourceRow.consecutive_conflicts || 0);
  const previousErrors = Number(sourceRow.consecutive_match_errors || 0);
  const cooldownMs = nextMatcherCooldownMs(context.outcome, previousConflicts, previousErrors, random);
  const consecutiveConflicts = context.outcome === "BUSINESS_CONFLICT" ? previousConflicts + 1 : 0;
  const consecutiveErrors = context.outcome === "DATABASE_ERROR" ? previousErrors + 1 : 0;
  const quarantined = consecutiveErrors >= MATCHER_SCHEDULER_POLICY.errorQuarantineThreshold;
  const timestamp = new Date(now).toISOString();
  return {
    cooldownMs,
    consecutiveConflicts,
    consecutiveErrors,
    quarantined,
    patch: {
      last_match_attempt_at: timestamp,
      next_match_attempt_at: new Date(now + cooldownMs).toISOString(),
      last_match_outcome: context.outcome,
      last_match_target_id: context.targetId,
      consecutive_conflicts: consecutiveConflicts,
      consecutive_match_errors: consecutiveErrors,
      matcher_quarantined_at: quarantined ? timestamp : null,
      updated_at: timestamp,
    },
  };
}

async function persistMatchAttemptState(sourceRow: SchedulerTicketRow, context: MatcherAttemptContext) {
  if (!sourceRow.id || sourceRow.state !== "searching") return;
  const state = buildMatchAttemptState(sourceRow, context);
  const { cooldownMs, consecutiveConflicts, consecutiveErrors, quarantined } = state;
  const { error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    .update(state.patch)
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

export async function runBoundedMatcherRows<T>(rows: T[], concurrency: number, processRow: (row: T) => Promise<void>) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      if (row) await processRow(row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, worker));
}

export function combineMatcherQueues<T>(freshRows: T[] = [], regularRows: T[] = []) {
  return [...freshRows, ...regularRows];
}

async function runMatcherBatch(rows: SchedulerTicketRow[], tickId: string, processTicket: MatcherProcessTicket) {
  const processRow = async (row: SchedulerTicketRow) => {
    const context = createMatcherAttemptContext(tickId, row.id);
    recordTicketProcessed(row.id);
    const startedAt = Date.now();
    try {
      const result = await processTicket(row, context);
      if (result?.state && result.state !== "searching") {
        context.markSuccess();
      } else if (context.outcome === "NO_CANDIDATE" && row.mode === "casual" && result?.group_id) {
        context.markWaiting();
      }
      await persistMatchAttemptState(row, context);
      observeLatency("matchmaking_start", Date.now() - startedAt);
    } catch (error) {
      context.recordDatabaseError(error);
      try {
        await persistMatchAttemptState(row, context);
      } catch (persistError) {
        console.warn(JSON.stringify({
          event: "matchmaking_attempt_state_error",
          message: persistError instanceof Error ? persistError.message : String(persistError),
        }));
      }
    }
  };
  await runBoundedMatcherRows(rows, MATCHER_SCHEDULER_POLICY.processingConcurrency, processRow);
}

async function runMatchmakingSweep(processTicket: MatcherProcessTicket) {
  if (matcherBusy) return;
  matcherBusy = true;
  const tickId = nextMatcherTick();
  try {
    if (!(await claimMatcherLease())) return;
    markActiveTick();
    await refreshMatcherPoolGauges();
    if (matcherCircuitOpen()) return;
    const eligibleAt = new Date().toISOString();
    const freshSince = new Date(Date.now() - MATCHER_SCHEDULER_POLICY.freshWindowMs).toISOString();
    const select = "id,user_id,mode,state,next_match_attempt_at,consecutive_conflicts,consecutive_match_errors,matcher_wake_at";
    const { data: freshRows, error: freshError } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select(select)
      .eq("state", "searching")
      .or(`next_match_attempt_at.is.null,next_match_attempt_at.lte.${eligibleAt}`)
      .gte("matcher_wake_at", freshSince)
      .order("matcher_wake_at", { ascending: false })
      .limit(MATCHER_SCHEDULER_POLICY.freshBatchSize);
    if (freshError) throw freshError;
    const { data: regularRows, error: regularError } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select(select)
      .eq("state", "searching")
      .or(`next_match_attempt_at.is.null,next_match_attempt_at.lte.${eligibleAt}`)
      .or(`matcher_wake_at.is.null,matcher_wake_at.lt.${freshSince}`)
      .order("search_started_at", { ascending: true })
      .limit(MATCHER_SCHEDULER_POLICY.regularBatchSize);
    if (regularError) throw regularError;
    const rows = combineMatcherQueues(freshRows || [], regularRows || []);
    setGauge("eligible_tickets", rows.length);
    await runMatcherBatch(rows as SchedulerTicketRow[], tickId, processTicket);
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
 * Starts one bounded, lease-protected matcher scheduler. Durable tickets and
 * database-side reservation rules remain owned by the injected business
 * processor; this module owns only cadence, fairness and fault isolation.
 */
export function startMatcherScheduler(processTicket: MatcherProcessTicket) {
  if (matcherHandle) return;
  const scheduleNextSweep = (delayMs: number) => {
    matcherHandle = setTimeout(() => {
      void runMatchmakingSweep(processTicket).finally(() => {
        scheduleNextSweep(nextMatcherIntervalMs());
      });
    }, delayMs);
    matcherHandle.unref?.();
  };
  scheduleNextSweep(0);
  matcherTelemetryHandle = setInterval(() => { void flushMatcherTelemetry(); }, 10_000);
  matcherTelemetryHandle.unref?.();
}
