import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../supabase";

export const MATCHER_RUNTIME_COUNTERS = [
  "matcher_ticks",
  "matcher_active_ticks",
  "tickets_processed",
  "pair_attempts",
  "pair_success",
  "pair_business_conflicts",
  "group_attempts",
  "group_success",
  "group_business_conflicts",
  "backfill_attempts",
  "backfill_success",
  "stale_candidate",
  "group_full",
  "room_locked",
  "actual_sql_40001",
  "database_errors",
  "transaction_timeouts",
  "matcher_retries",
  "matcher_backoffs",
  "same_target_suppressed",
  "duplicate_prevented",
  "compatible_searching_stuck",
  "circuit_breaker_trips",
] as const;

export const MATCHER_RUNTIME_GAUGES = [
  "searching_tickets",
  "eligible_tickets",
  "unique_tickets_processed",
  "forming_rooms",
  "matcher_instances_alive",
] as const;

export const MATCHER_RUNTIME_LATENCIES = [
  "time_to_first_match",
  "time_to_pair",
  "time_to_forming_room",
  "backfill_latency",
  "matchmaking_start",
] as const;

export type MatcherRuntimeEvent = {
  runId?: string;
  tickId?: string;
  ticketId?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  candidateId?: string | null;
  operation: string;
  outcome: string;
  reasonCode?: string | null;
  attemptNumber?: number;
  cooldownMs?: number;
  latencyMs?: number;
  timestamp?: string;
};

type MetricBucket = {
  minuteStart: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  latencyTotals: Record<string, number>;
  latencyCounts: Record<string, number>;
  processedTicketIds: Set<string>;
  events: MatcherRuntimeEvent[];
};

const instanceId = `${process.env.HOSTNAME || "node"}:${process.pid}:${randomUUID()}`;
const processId = String(process.pid);
const containerId = process.env.HOSTNAME || null;
const startedAt = new Date().toISOString();
const runId = process.env.MATCHMAKING_RUN_ID || "production";
// Even abnormal windows are capped so telemetry cannot recreate the incident
// by turning every contended candidate into a database write.
const eventLimitPerMinute = 500;
let tickSequence = 0;
let currentBucket = createBucket();
let lastLeaseCheckAt = 0;
let leader = false;
let flushing = false;
let lastTelemetryWarningAt = 0;
let circuitOpenUntil = 0;

function minuteStart(date = new Date()) {
  const value = new Date(date);
  value.setUTCSeconds(0, 0);
  return value.toISOString();
}

function createBucket(start = minuteStart()) : MetricBucket {
  const counters: Record<string, number> = {};
  for (const key of MATCHER_RUNTIME_COUNTERS) counters[key] = 0;
  const gauges: Record<string, number> = {};
  for (const key of MATCHER_RUNTIME_GAUGES) gauges[key] = 0;
  const latencyTotals: Record<string, number> = {};
  const latencyCounts: Record<string, number> = {};
  for (const key of MATCHER_RUNTIME_LATENCIES) {
    latencyTotals[key] = 0;
    latencyCounts[key] = 0;
  }
  return { minuteStart: start, counters, gauges, latencyTotals, latencyCounts, processedTicketIds: new Set(), events: [] };
}

function rotateBucketIfNeeded() {
  const now = minuteStart();
  if (currentBucket.minuteStart !== now) {
    const previous = currentBucket;
    currentBucket = createBucket(now);
    void flushBucket(previous);
  }
}

function bucket() {
  rotateBucketIfNeeded();
  return currentBucket;
}

export function matcherRuntimeIdentity() {
  return { instanceId, processId, containerId, startedAt, runId };
}

export function nextMatcherTick() {
  const tickId = `${instanceId}:${Date.now()}:${++tickSequence}`;
  increment("matcher_ticks");
  return tickId;
}

export function increment(name: (typeof MATCHER_RUNTIME_COUNTERS)[number], value = 1) {
  const current = bucket();
  current.counters[name] = (current.counters[name] || 0) + value;
}

export function setGauge(name: (typeof MATCHER_RUNTIME_GAUGES)[number], value: number) {
  bucket().gauges[name] = Math.max(0, Math.round(value));
}

export function recordTicketProcessed(ticketId: string) {
  const current = bucket();
  current.processedTicketIds.add(ticketId);
  current.gauges.unique_tickets_processed = current.processedTicketIds.size;
  increment("tickets_processed");
}

export function observeLatency(name: (typeof MATCHER_RUNTIME_LATENCIES)[number], milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  const current = bucket();
  current.latencyTotals[name] = (current.latencyTotals[name] || 0) + milliseconds;
  current.latencyCounts[name] = (current.latencyCounts[name] || 0) + 1;
}

export function recordMatcherEvent(event: MatcherRuntimeEvent) {
  const current = bucket();
  if (current.events.length < eventLimitPerMinute) {
    current.events.push({
      ...event,
      runId: event.runId || runId,
      timestamp: event.timestamp || new Date().toISOString(),
    });
  }
}

export function isActualSqlSerializationFailure(error: any) {
  return String(error?.code || error?.details?.code || "") === "40001";
}

export function isDatabaseTimeout(error: any) {
  const code = String(error?.code || error?.details?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return ["57014", "57P01"].includes(code) || message.includes("timeout") || message.includes("timed out");
}

export async function claimMatcherLease() {
  const now = Date.now();
  if (now - lastLeaseCheckAt < 5_000) return leader;
  lastLeaseCheckAt = now;
  const { data, error } = await supabaseAdmin().rpc("matchmaking_claim_matcher_lease", {
    p_instance_id: instanceId,
    p_process_id: processId,
    p_container_id: containerId,
    p_run_id: runId,
  });
  if (error) {
    leader = false;
    increment("database_errors");
    recordMatcherEvent({ operation: "claim_matcher_lease", outcome: "LEASE_FAILURE", reasonCode: error.code || "RPC_ERROR" });
    warnTelemetryOnce(`lease:${error.message}`);
    return false;
  }
  leader = data?.leader === true;
  setGauge("matcher_instances_alive", Number(data?.alive_instances || 0));
  if (leader) increment("matcher_active_ticks", 0);
  return leader;
}

export function markActiveTick() {
  increment("matcher_active_ticks");
}

/**
 * Stop new Matcher writes for a short, reversible window when the local
 * minute bucket itself proves amplification. The database/API remain online;
 * the next tick can resume after cooldown if the signal has cleared.
 */
export function matcherCircuitOpen() {
  const current = bucket();
  const conflicts = (current.counters.pair_business_conflicts || 0)
    + (current.counters.group_business_conflicts || 0);
  const processed = current.counters.tickets_processed || 0;
  const unique = current.gauges.unique_tickets_processed || 0;
  const amplified = unique > 0 && processed / unique >= 20 && processed >= 20;
  const severe = conflicts >= 200 || current.counters.actual_sql_40001 >= 5 || current.counters.database_errors >= 50;
  if (Date.now() < circuitOpenUntil) return true;
  if (!amplified && !severe) return false;
  circuitOpenUntil = Date.now() + 30_000;
  increment("circuit_breaker_trips");
  if (amplified) increment("compatible_searching_stuck");
  recordMatcherEvent({
    operation: "persistent_matcher",
    outcome: "CIRCUIT_BREAKER_OPEN",
    reasonCode: amplified ? "POSSIBLE_MATCHER_BUSY_LOOP" : severe ? "MATCHMAKING_STORM" : "UNKNOWN",
  });
  return true;
}

export async function flushMatcherTelemetry() {
  rotateBucketIfNeeded();
  await flushBucket(currentBucket);
}

async function flushBucket(snapshot: MetricBucket) {
  if (flushing) return;
  flushing = true;
  try {
    const { error } = await supabaseAdmin().rpc("matchmaking_flush_runtime", {
      p_instance_id: instanceId,
      p_process_id: processId,
      p_container_id: containerId,
      p_started_at: startedAt,
      p_minute_start: snapshot.minuteStart,
      p_leader: leader,
      p_run_id: runId,
      p_snapshot: {
        ...snapshot.counters,
        ...snapshot.gauges,
        latency_totals: snapshot.latencyTotals,
        latency_counts: snapshot.latencyCounts,
      },
      p_events: snapshot.events,
    });
    if (error) warnTelemetryOnce(`flush:${error.message}`);
  } finally {
    flushing = false;
  }
}

function warnTelemetryOnce(message: string) {
  const now = Date.now();
  if (now - lastTelemetryWarningAt < 60_000) return;
  lastTelemetryWarningAt = now;
  console.warn(JSON.stringify({ event: "matchmaking_runtime_telemetry_error", message }));
}
