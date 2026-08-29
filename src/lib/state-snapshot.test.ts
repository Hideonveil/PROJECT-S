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
      requestedCompletedSessionId: previousSession.id,
    })).toBeNull();
  });

  it("does not replay historical postgame state without an explicit Session context", () => {
    const previousSession = {
      id: "session-old",
      roomId: "room-old",
      roomCode: "OLD001",
      status: "completed",
    };

    expect(selectSnapshotSession({
      room: null,
      activeSession: null,
      completedSession: previousSession,
      requestedCompletedSessionId: null,
    })).toBeNull();
  });

  it("restores only the explicitly requested completed Session", () => {
    const completedSession = {
      id: "session-current",
      roomId: "room-current",
      roomCode: "CURRENT1",
      status: "completed",
    };

    expect(selectSnapshotSession({
      room: null,
      activeSession: null,
      completedSession,
      requestedCompletedSessionId: completedSession.id,
    })).toBe(completedSession);
    expect(selectSnapshotSession({
      room: null,
      activeSession: null,
      completedSession,
      requestedCompletedSessionId: "session-other",
    })).toBeNull();
  });
});
