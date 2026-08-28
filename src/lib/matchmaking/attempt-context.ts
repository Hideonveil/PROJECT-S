import {
  increment as incrementRuntimeMetric,
  isActualSqlSerializationFailure,
  isDatabaseTimeout,
  recordMatcherEvent,
} from "./runtime-telemetry";

export type MatcherAttemptOutcome =
  | "NO_CANDIDATE"
  | "BUSINESS_CONFLICT"
  | "SUCCESS"
  | "WAITING"
  | "DATABASE_ERROR";

export class MatcherAttemptContext {
  readonly startedAt = Date.now();
  private currentOutcome: MatcherAttemptOutcome = "NO_CANDIDATE";
  private currentReasonCode: string | null = null;
  private currentTargetId: string | null = null;
  private currentConflictCount = 0;

  constructor(readonly tickId: string, readonly ticketId: string) {}

  get outcome() { return this.currentOutcome; }
  get reasonCode() { return this.currentReasonCode; }
  get targetId() { return this.currentTargetId; }
  get conflictCount() { return this.currentConflictCount; }

  markSuccess(targetId?: string | null) {
    this.currentOutcome = "SUCCESS";
    this.currentReasonCode = null;
    if (targetId !== undefined) this.currentTargetId = targetId || null;
  }

  markWaiting() {
    if (this.currentOutcome === "NO_CANDIDATE") this.currentOutcome = "WAITING";
  }

  recordBusinessConflict(reasonCode: string, targetId?: string | null) {
    this.currentConflictCount += 1;
    this.currentOutcome = "BUSINESS_CONFLICT";
    this.currentReasonCode = reasonCode;
    this.currentTargetId = targetId || null;
    if (reasonCode === "STALE_CANDIDATE") incrementRuntimeMetric("stale_candidate");
    if (reasonCode === "GROUP_FULL") incrementRuntimeMetric("group_full");
    if (reasonCode === "ROOM_LOCKED") incrementRuntimeMetric("room_locked");
    recordMatcherEvent({
      tickId: this.tickId,
      ticketId: this.ticketId,
      candidateId: targetId || null,
      operation: "reserve",
      outcome: "BUSINESS_CONFLICT",
      reasonCode,
      attemptNumber: this.currentConflictCount,
    });
  }

  recordDatabaseError(error: unknown) {
    const serializationFailure = isActualSqlSerializationFailure(error);
    const timeout = isDatabaseTimeout(error);
    this.currentOutcome = "DATABASE_ERROR";
    this.currentReasonCode = serializationFailure ? "DATABASE_SERIALIZATION_FAILURE" : "DATABASE_ERROR";
    if (serializationFailure) incrementRuntimeMetric("actual_sql_40001");
    if (timeout) incrementRuntimeMetric("transaction_timeouts");
    incrementRuntimeMetric("database_errors");
    recordMatcherEvent({
      tickId: this.tickId,
      ticketId: this.ticketId,
      operation: "matchmaking_attempt",
      outcome: serializationFailure ? "SQL_SERIALIZATION_FAILURE" : timeout ? "TIMEOUT" : "DATABASE_ERROR",
      reasonCode: this.currentReasonCode,
    });
  }
}

export function createMatcherAttemptContext(tickId: string, ticketId: string) {
  return new MatcherAttemptContext(tickId, ticketId);
}
