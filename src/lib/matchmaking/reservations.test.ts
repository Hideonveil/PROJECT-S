import { describe, expect, it } from "vitest";
import { isGroupReservationConflict, isPairReservationConflict } from "./reservations";

describe("reservation result classification", () => {
  it("classifies typed pair and group contention as expected business outcomes", () => {
    expect(isPairReservationConflict(null, { ok: false, reason: "MATCH_RESERVATION_CONFLICT" })).toBe(true);
    expect(isGroupReservationConflict(null, { ok: false, reason: "GROUP_RESERVATION_CONFLICT" })).toBe(true);
    expect(isGroupReservationConflict(null, { ok: false, reason: "GROUP_SIZE_CONFLICT" })).toBe(true);
  });

  it("never disguises a real SQL serialization failure as business contention", () => {
    expect(isPairReservationConflict({ code: "40001", message: "MATCH_RESERVATION_CONFLICT" })).toBe(false);
    expect(isGroupReservationConflict({ code: "40001", message: "GROUP_RESERVATION_CONFLICT" })).toBe(false);
  });

  it("keeps legacy non-serialization business errors compatible", () => {
    expect(isPairReservationConflict({ code: "P0001", message: "MATCH_RESERVATION_CONFLICT" })).toBe(true);
    expect(isGroupReservationConflict({ code: "P0001", message: "GROUP_SIZE_CONFLICT" })).toBe(true);
  });
});
