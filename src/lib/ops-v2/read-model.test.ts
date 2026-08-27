import { describe, expect, it } from "vitest";
import { classifyRoomAnomalies, isSyntheticProfile, resumeState } from "./read-model";

describe("OPS V2 read model", () => {
  it("marks a terminal room that retains active members as an anomaly", () => {
    expect(classifyRoomAnomalies({ status: "completed", activeMembers: 1, hasLiveTicket: false, hasLiveSession: false })).toContain("TERMINAL_ROOM_ACTIVE_MEMBER");
  });

  it("does not make terminal session membership resume eligible", () => {
    expect(resumeState({ roomStatus: "open", activeMember: true, ticketLive: false, groupLive: false, sessionStatus: "completed", belongsToSession: true })).toBe("NOT_RECOVERABLE");
  });

  it("identifies permanently marked synthetic profiles for an explicit dashboard label", () => {
    expect(isSyntheticProfile({ account_type: "synthetic_test", test_purpose: "capacity" })).toBe(true);
    expect(isSyntheticProfile({ account_type: "player" })).toBe(false);
  });
});
