import { describe, expect, it } from "vitest";
import { selectSnapshotSession } from "./state-snapshot";

describe("state snapshot Room/Session scope", () => {
  it("does not attach the previous completed Session to a new pre-Session Room", () => {
    const currentRoom = { id: "room-new", code: "NEW001", status: "connecting" };
    const previousSession = {
      id: "session-old",
      roomId: "room-old",
      roomCode: "OLD001",
      status: "completed",
    };

    expect(selectSnapshotSession({
      room: currentRoom,
      activeSession: null,
      completedSession: previousSession,
    })).toBeNull();
  });
});
