import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");

describe("reservation conflict guard", () => {
  it("bounds candidate reservation conflicts instead of walking the full candidate list", () => {
    expect(service).toContain("const RESERVATION_CONFLICT_BUDGET = 2;");
    expect(service).toContain("if (conflictCount >= RESERVATION_CONFLICT_BUDGET) break;");
    expect(service).toContain("if (conflictCount >= RESERVATION_CONFLICT_BUDGET) return activeTicketRow(userId);");
  });

  it("backs off between distinct candidates and does not blindly retry the same mutation", () => {
    expect(service).toContain("function waitForReservationConflict(conflictNumber: number)");
    expect(service).toContain("Math.random() * RESERVATION_CONFLICT_BACKOFF_JITTER_MS");
    expect(service).toContain("await waitForReservationConflict(conflictCount)");
    expect(service).toContain("continue;");
    expect(service).toContain('String(error?.code || "") !== "40001"');
    expect(service).toContain("hasReservationConflictReason(data");
    expect(service).toContain("isPairReservationConflict(error, pair)");
    expect(service).toContain("isGroupReservationConflict(error, reservation)");
  });

  it("serializes matching mutations per user", () => {
    expect(service).toContain("const matchmakingFlights = new Map<string, Promise<unknown>>();");
    expect(service).toContain("withMatchmakingFlight(userId, () => startTicketInternal");
    expect(service).toContain("withMatchmakingFlight(userId, () => joinPublicTicketInternal");
    expect(service).toContain("withMatchmakingFlight(userId, () => confirmPairInternal");
    expect(service).toContain("withMatchmakingFlight(userId, () => confirmGroupInternal");
    expect(service).toContain("withMatchmakingFlight(userId, () => cancelTicketInternal");
  });

  it("does not re-run matching work when the idempotent start RPC reused an active ticket", () => {
    expect(service).toContain("if (data?.reused) return matchmakingStatus(userId);");
  });

  it("emits bounded reserve attempt and conflict counters without writing a database event per conflict", () => {
    expect(service).toContain('event: "matchmaking_reservation_metrics"');
    expect(service).toContain("reserve_attempts: reservationMetricBucket.reserveAttempts");
    expect(service).toContain("pair_conflicts: reservationMetricBucket.pairConflicts");
    expect(service).toContain("group_conflicts: reservationMetricBucket.groupConflicts");
    expect(service).not.toContain("trackEvent(\"matchmaking_reservation_conflict\"");
  });
});
