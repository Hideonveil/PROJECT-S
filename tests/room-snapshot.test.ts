import { describe, expect, it } from "vitest";
import { liveRoomSnapshot } from "../src/lib/room-snapshot";

describe("live Room snapshot", () => {
  it("projects only active members and changes its version when the roster changes", () => {
    const base = {
      id: "room-1",
      code: "ROOM-1",
      status: "connecting",
      recruiting: true,
      targetTotalPlayers: 4,
      members: [
        { id: "a", nickname: "阿澈", memberStatus: "active" },
        { id: "b", nickname: "Borealis", memberStatus: "active" },
        { id: "gone", nickname: "离开的玩家", memberStatus: "exited", exitedAt: "2026-08-27T00:00:00.000Z" },
      ],
      players: [],
    } as any;

    const first = liveRoomSnapshot(base, "2026-08-27T01:00:00.000Z");
    const second = liveRoomSnapshot({ ...base, members: base.members.slice(0, 1) }, "2026-08-27T01:00:01.000Z");

    expect(first.room.members.map((member: any) => member.id)).toEqual(["a", "b"]);
    expect(first.room.activeMemberCount).toBe(2);
    expect(first.room.currentMemberCount).toBe(2);
    expect(first.snapshotVersion).not.toBe(second.snapshotVersion);
    expect(first.generatedAt).toBe("2026-08-27T01:00:00.000Z");
  });

  it("uses the server-issued Room version when it is available", () => {
    const snapshot = liveRoomSnapshot({
      id: "room-2",
      code: "ROOM-2",
      status: "connecting",
      need: {},
      players: [],
      members: [],
      goodbyeRequests: [],
      realtimeVersion: 42,
    } as any);

    expect(snapshot.snapshotVersion).toBe("42");
  });
});
