import { increment as incrementRuntimeMetric } from "./runtime-telemetry";

// One matcher tick gets one reservation attempt for a ticket. A normal
// contention result is durable state, not a reason to spin on the same
// candidate while other tickets are waiting.
export const RESERVATION_CONFLICT_BUDGET = 1;
export const CASUAL_BACKFILL_BUDGET = 1;

type ReservationKind = "pair" | "group";

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

export function recordReservationAttempt(kind?: ReservationKind) {
  const minute = currentMetricMinute();
  flushReservationMetrics(minute);
  if (!reservationMetricBucket) return;
  reservationMetricBucket.reserveAttempts += 1;
  if (kind === "pair") incrementRuntimeMetric("pair_attempts");
  if (kind === "group") incrementRuntimeMetric("group_attempts");
}

export function recordReservationConflict(kind: ReservationKind) {
  const minute = currentMetricMinute();
  flushReservationMetrics(minute);
  if (!reservationMetricBucket) return;
  if (kind === "pair") reservationMetricBucket.pairConflicts += 1;
  if (kind === "group") reservationMetricBucket.groupConflicts += 1;
  incrementRuntimeMetric(kind === "pair" ? "pair_business_conflicts" : "group_business_conflicts");
}

export function reservationMetricsSnapshot() {
  flushReservationMetrics(currentMetricMinute());
  return reservationMetricBucket ? { ...reservationMetricBucket } : null;
}

function hasReservationConflictReason(data: any, reasons: string[]) {
  return data?.ok === false && reasons.includes(data?.reason);
}

export function isPairReservationConflict(error: any, data?: any) {
  // Business contention must be a committed typed result. A legacy exception
  // carrying SQLSTATE 40001 is deliberately not accepted as a business miss.
  return hasReservationConflictReason(data, ["MATCH_RESERVATION_CONFLICT"])
    || (String(error?.code || "") !== "40001" && error?.message?.includes("MATCH_RESERVATION_CONFLICT"));
}

export function isGroupReservationConflict(error: any, data?: any) {
  return hasReservationConflictReason(data, ["GROUP_RESERVATION_CONFLICT", "GROUP_SIZE_CONFLICT"])
    || (String(error?.code || "") !== "40001" && error?.message?.includes("GROUP_RESERVATION_CONFLICT"))
    || (String(error?.code || "") !== "40001" && error?.message?.includes("GROUP_SIZE_CONFLICT"));
}
