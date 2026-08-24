import { appendFile, mkdir } from "node:fs/promises";

export const TIMEOUT_SOURCES = Object.freeze([
  "auth",
  "request",
  "matching_wait",
  "realtime_wait",
  "stage",
  "cleanup",
]);

export const MUTATION_OUTCOMES = Object.freeze([
  "COMMITTED_RESPONSE_RECEIVED",
  "COMMITTED_RESPONSE_LOST",
  "NOT_COMMITTED_CONFIRMED",
  "UNKNOWN",
]);

function redactText(value) {
  return String(value ?? "unknown")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access[_-]?token|refresh[_-]?token|password|secret)[=:][^\s,}]+/gi, "$1=[REDACTED]");
}

function safeCause(cause) {
  if (!cause) return null;
  if (typeof cause !== "object") return redactText(cause);
  return {
    name: cause.name || null,
    message: redactText(cause.message || cause),
    code: cause.code || null,
    syscall: cause.syscall || null,
    address: cause.address || null,
    port: cause.port || null,
    errno: cause.errno ?? null,
  };
}

export function serializeError(error) {
  if (!error) return null;
  const cause = safeCause(error.cause);
  return {
    name: error.name || "Error",
    message: redactText(error.message || error),
    cause,
    cause_code: cause && typeof cause === "object" ? cause.code : null,
    timeout_source: error.timeoutSource || null,
    code: error.code || null,
  };
}

export class CapacityTimeoutError extends Error {
  constructor(source, message = `${source} timeout`, cause = null) {
    if (!TIMEOUT_SOURCES.includes(source)) throw new Error(`Unknown timeout source: ${source}`);
    super(message, cause ? { cause } : undefined);
    this.name = "TimeoutError";
    this.code = "CAPACITY_TIMEOUT";
    this.timeoutSource = source;
  }
}

export function timeoutError(source, message, cause = null) {
  return new CapacityTimeoutError(source, message, cause);
}

export function isCapacityTimeout(error) {
  return error?.name === "TimeoutError" && TIMEOUT_SOURCES.includes(error?.timeoutSource);
}

export function withTimeout(operation, timeoutMs, source, message = `${source} timeout`) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(source, message)), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(() => operation), timeout]).finally(() => clearTimeout(timer));
}

export function snapshotState(state = {}) {
  const matchmaking = state.matchmaking || {};
  const session = state.session || {};
  const room = state.room || {};
  return {
    ticket_id: matchmaking.ticket?.id || null,
    pair_id: matchmaking.pair?.id || null,
    group_id: matchmaking.group?.id || null,
    room_id: room.id || null,
    session_id: session.id || null,
    room_status: room.status || null,
    session_status: session.status || null,
    matchmaking_status: matchmaking.ticket?.status || matchmaking.group?.state || matchmaking.pair?.status || null,
    user_id: state.user?.id || null,
  };
}

export function buildActionEvent({
  runId,
  actorId,
  action,
  endpoint,
  requestId,
  startedAt,
  finishedAt,
  latencyMs,
  httpStatus = null,
  error = null,
  identifiers = {},
  expectedState = null,
  actualState = null,
  mutationOutcome = null,
}) {
  return {
    run_id: runId,
    actor_id: actorId,
    action,
    endpoint,
    request_id: requestId || null,
    started_at: startedAt,
    finished_at: finishedAt,
    latency_ms: latencyMs == null ? null : Number(Number(latencyMs).toFixed(2)),
    http_status: httpStatus,
    error: serializeError(error),
    ticket_id: identifiers.ticket_id || null,
    pair_id: identifiers.pair_id || null,
    group_id: identifiers.group_id || null,
    room_id: identifiers.room_id || null,
    session_id: identifiers.session_id || null,
    expected_state: expectedState,
    actual_state: actualState,
    ...(mutationOutcome ? { mutation_outcome: mutationOutcome } : {}),
  };
}

export function classifyMutationOutcome({ expectedState, beforeState, afterState }) {
  if (typeof expectedState === "function" && expectedState(afterState)) return "COMMITTED_RESPONSE_LOST";
  if (typeof expectedState === "function" && beforeState && expectedState(beforeState) && !expectedState(afterState)) return "NOT_COMMITTED_CONFIRMED";
  return "UNKNOWN";
}

export async function createAppendOnlyLedger({ directory, filename = "lifecycle-ledger.ndjson" }) {
  await mkdir(directory, { recursive: true });
  const file = `${directory}/${filename}`;
  let queue = Promise.resolve();
  return {
    file,
    append(event) {
      const line = `${JSON.stringify(event)}\n`;
      queue = queue.then(() => appendFile(file, line, { encoding: "utf8", mode: 0o600 }));
      return queue;
    },
    flush() {
      return queue;
    },
  };
}
