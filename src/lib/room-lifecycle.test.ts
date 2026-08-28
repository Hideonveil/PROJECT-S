import { describe, expect, it } from "vitest";
import {
  canApplyRoomSnapshot,
  goodbyeSettlement,
  recruitmentVoteState,
} from "./room-lifecycle";

describe("room lifecycle authority", () => {
  it("never lets an older or unversioned hydration overwrite a newer room snapshot", () => {
    expect(canApplyRoomSnapshot({ roomId: "r1", version: 8 }, { roomId: "r1", version: 9 })).toBe(false);
    expect(canApplyRoomSnapshot({ roomId: "r1", version: null }, { roomId: "r1", version: 9 })).toBe(false);
    expect(canApplyRoomSnapshot({ roomId: "r2", version: 1 }, { roomId: "r1", version: 99 })).toBe(true);
  });

  it("keeps a slipped participant settled for unanimous goodbye", () => {
    expect(goodbyeSettlement({
      participants: ["a", "b"],
      goodbyeUserIds: ["a", "b"],
      exitedUserIds: ["a"],
    })).toEqual({ settled: 2, total: 2, completed: true });
  });

  it("does not remove a disconnected participant from the goodbye denominator", () => {
    expect(goodbyeSettlement({
      participants: ["a", "b", "c"],
      goodbyeUserIds: ["a", "b"],
      exitedUserIds: ["a"],
    })).toEqual({ settled: 2, total: 3, completed: false });
  });

  it("restarts stop-recruitment voting after a member exits", () => {
    expect(recruitmentVoteState({
      activeUserIds: ["a", "c"],
      voteUserIds: ["a", "b"],
      membershipVersion: 4,
      voteMembershipVersion: 3,
    })).toEqual({ votes: 0, total: 2, locked: false, resetRequired: true });
  });

  it("keeps existing votes when a member joins and increases the denominator", () => {
    expect(recruitmentVoteState({
      activeUserIds: ["a", "b", "c"],
      voteUserIds: ["a", "b"],
      membershipVersion: 4,
      voteMembershipVersion: 4,
    })).toEqual({ votes: 2, total: 3, locked: false, resetRequired: false });
  });
});
