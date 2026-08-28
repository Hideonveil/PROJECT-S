import { describe, expect, it } from "vitest";
import {
  RESERVATION_CONFLICT_BUDGET,
  isGroupReservationConflict,
  isPairReservationConflict,
  recordReservationAttempt,
  recordReservationConflict,
  reservationMetricsSnapshot,
} from "../src/lib/matchmaking/reservations";
import { nextMatcherCooldownMs } from "../src/lib/matchmaking/scheduler";

describe("reservation conflict guard", () => {
  it("allows only one contention result per ticket attempt", () => {
    expect(RESERVATION_CONFLICT_BUDGET).toBe(1);
  });

  it("backs off conflicts and quarantines repeated database errors", () => {
    expect(nextMatcherCooldownMs("BUSINESS_CONFLICT", 0, 0, () => 0)).toBe(1_000);
    expect(nextMatcherCooldownMs("BUSINESS_CONFLICT", 1, 0, () => 0)).toBe(2_000);
    expect(nextMatcherCooldownMs("DATABASE_ERROR", 0, 2, () => 0)).toBe(300_000);
  });

  it("never classifies SQLSTATE 40001 as ordinary business contention", () => {
    expect(isPairReservationConflict(null, { ok: false, reason: "MATCH_RESERVATION_CONFLICT" })).toBe(true);
    expect(isGroupReservationConflict(null, { ok: false, reason: "GROUP_RESERVATION_CONFLICT" })).toBe(true);
    expect(isPairReservationConflict({ code: "40001", message: "MATCH_RESERVATION_CONFLICT" })).toBe(false);
    expect(isGroupReservationConflict({ code: "40001", message: "GROUP_RESERVATION_CONFLICT" })).toBe(false);
  });

  it("counts reservation attempts and conflicts through the module interface", () => {
    const before = reservationMetricsSnapshot();
    recordReservationAttempt("pair");
    recordReservationAttempt("group");
    recordReservationConflict("pair");
    recordReservationConflict("group");
    const after = reservationMetricsSnapshot();

    expect(after?.reserveAttempts).toBe((before?.reserveAttempts || 0) + 2);
    expect(after?.pairConflicts).toBe((before?.pairConflicts || 0) + 1);
    expect(after?.groupConflicts).toBe((before?.groupConflicts || 0) + 1);
  });
});
