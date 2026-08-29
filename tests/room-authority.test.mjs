import { describe, expect, it } from "vitest";
import { createRoomAuthority } from "../public/js/room-authority.js";

function room(overrides = {}) {
  return {
    id: "room-a",
    code: "ROOM-A",
    status: "connecting",
    realtimeVersion: 4,
    recruiting: true,
    shell: false,
    members: [{ id: "me", name: "我", memberStatus: "active" }],
    ...overrides,
  };
}

function authority() {
  return createRoomAuthority({
    normalizeRoom: (value) => ({ ...value }),
    roomSignature: (value) => JSON.stringify(value),
    isResumableRoom: (value) => Boolean(value?.id && value.status !== "completed"),
  });
}

describe("browser Room authority", () => {
  it("accepts one monotonic Room timeline and ignores older or duplicate snapshots", () => {
    const subject = authority();
    expect(subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" })).toMatchObject({
      decision: "accept",
      effect: "enter-room",
    });
    expect(subject.dispatch({ type: "snapshot", room: room({ realtimeVersion: 3 }), source: "realtime", route: "room" })).toMatchObject({
      decision: "ignore",
      reason: "older-version",
    });
    expect(subject.dispatch({ type: "snapshot", room: room(), source: "realtime", route: "room" })).toMatchObject({
      decision: "noop",
      effect: "none",
    });
  });

  it("does not switch Room ids from late background work", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" });

    expect(subject.dispatch({
      type: "snapshot",
      room: room({ id: "room-old", code: "OLD" }),
      source: "hydration",
      route: "room",
    })).toMatchObject({ decision: "ignore", reason: "different-room", room: { id: "room-a" } });

    expect(subject.dispatch({
      type: "snapshot",
      room: room({ id: "room-b", code: "ROOM-B", realtimeVersion: 1 }),
      source: "start",
      route: "home",
    })).toMatchObject({ decision: "accept", effect: "enter-room" });
  });

  it("lets the current authoritative state move a waiting shell into the shared Room", () => {
    const subject = authority();
    subject.dispatch({
      type: "snapshot",
      room: room({ id: "waiting-b", code: "WAITING-B", shell: true, resumeEligible: true }),
      source: "start",
      route: "home",
    });
    const observedGeneration = subject.dispatch({ type: "checkpoint" }).generation;

    const result = subject.dispatch({
      type: "snapshot",
      room: room({
        id: "shared-a",
        code: "SHARED-A",
        shell: false,
        resumeEligible: true,
        members: [
          { id: "me", name: "我", memberStatus: "active" },
          { id: "player-a", name: "队友", memberStatus: "active" },
        ],
      }),
      source: "state",
      route: "room",
      observedGeneration,
      confirmedHandoff: true,
    });

    expect(result).toMatchObject({
      decision: "accept",
      effect: "patch-room",
      room: { id: "shared-a", shell: false, resumeEligible: true },
    });
    expect(result.room.members).toHaveLength(2);
  });

  it("lets an unversioned snapshot supplement but never downgrade a versioned Room", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" });

    const result = subject.dispatch({
      type: "snapshot",
      room: {
        id: "room-a",
        code: "ROOM-A",
        status: "connecting",
        recruiting: false,
        shell: true,
        formationState: "forming",
        members: [],
      },
      source: "hydration",
      route: "room",
    });

    expect(result).toMatchObject({ decision: "accept", effect: "patch-room" });
    expect(result.room).toMatchObject({
      realtimeVersion: 4,
      recruiting: true,
      shell: false,
      formationState: "forming",
    });
    expect(result.room.members).toHaveLength(1);
  });

  it("tombstones on click, rolls back on failure, and permanently suppresses a completed exit", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" });
    subject.dispatch({ type: "begin-exit", roomId: "room-a" });

    expect(subject.dispatch({ type: "snapshot", room: null, source: "state", route: "room" })).toMatchObject({
      decision: "ignore",
      reason: "exit-pending",
      room: { id: "room-a" },
    });

    expect(subject.dispatch({ type: "snapshot", room: room({ realtimeVersion: 5 }), source: "realtime", route: "room" })).toMatchObject({
      decision: "ignore",
      reason: "exit-pending",
    });

    subject.dispatch({ type: "exit-failed", roomId: "room-a" });
    expect(subject.dispatch({ type: "inspect", roomId: "room-a" })).toMatchObject({ room: { id: "room-a" } });
    expect(subject.dispatch({ type: "snapshot", room: room({ realtimeVersion: 5 }), source: "realtime", route: "room" })).toMatchObject({
      decision: "accept",
      effect: "patch-room",
    });

    subject.dispatch({ type: "begin-exit", roomId: "room-a" });
    expect(subject.dispatch({ type: "exit-complete", roomId: "room-a" })).toMatchObject({
      decision: "clear",
      effect: "clear-room",
    });
    expect(subject.dispatch({ type: "snapshot", room: room({ realtimeVersion: 6 }), source: "realtime", route: "home" })).toMatchObject({
      decision: "ignore",
      reason: "exited-room",
    });
  });

  it("does not let an old null state read clear a Room accepted after that read began", () => {
    const subject = authority();
    const beforeStart = subject.dispatch({ type: "checkpoint" }).generation;
    subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" });

    expect(subject.dispatch({
      type: "snapshot",
      room: null,
      source: "state",
      route: "room",
      observedGeneration: beforeStart,
    })).toMatchObject({
      decision: "ignore",
      reason: "stale-authority-generation",
      room: { id: "room-a" },
    });
  });

  it("does not let a same-version shell erase a fully hydrated Room", () => {
    const subject = authority();
    subject.dispatch({
      type: "snapshot",
      room: room({ shell: false, members: [room().members[0], { id: "player-b", name: "队友", memberStatus: "active" }] }),
      source: "start",
      route: "home",
    });

    const result = subject.dispatch({
      type: "snapshot",
      room: room({ shell: true, members: [room().members[0]] }),
      source: "hydration",
      route: "room",
    });

    expect(result).toMatchObject({ decision: "noop", room: { shell: false } });
    expect(result.room.members).toHaveLength(2);
  });

  it("prompts on restored Rooms but enters the same Room after explicit confirmation", () => {
    const restored = authority();
    expect(restored.dispatch({ type: "snapshot", room: room(), source: "state", route: "home" })).toMatchObject({
      decision: "accept",
      effect: "prompt-resume",
    });
    expect(restored.dispatch({ type: "snapshot", room: room(), source: "resume-confirmed", route: "home" })).toMatchObject({
      decision: "noop",
      effect: "enter-room",
    });
  });

  it("enters an already-known Room when the legacy matching route catches up", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room(), source: "state", route: "room" });
    expect(subject.dispatch({ type: "snapshot", room: room(), source: "state", route: "matching" })).toMatchObject({
      decision: "noop",
      effect: "enter-room",
    });
  });

  it("keeps resolver eligibility when a same-Room mutation returns a partial projection", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room({ resumeEligible: true }), source: "start", route: "home" });

    const result = subject.dispatch({
      type: "snapshot",
      room: room({ realtimeVersion: 4, resumeEligible: false, recruitmentVoteCount: 1 }),
      source: "mutation",
      route: "room",
    });

    expect(result).toMatchObject({ decision: "accept", effect: "patch-room" });
    expect(result.room).toMatchObject({ resumeEligible: true, recruitmentVoteCount: 1 });
  });

  it("only clears a Room from an authoritative resolver, terminal Session, or completed exit", () => {
    const subject = authority();
    subject.dispatch({ type: "snapshot", room: room(), source: "start", route: "home" });

    expect(subject.dispatch({ type: "snapshot", room: null, source: "hydration", route: "room" })).toMatchObject({
      decision: "ignore",
      reason: "non-authoritative-null",
    });
    expect(subject.dispatch({ type: "snapshot", room: null, source: "state", route: "room" })).toMatchObject({
      decision: "clear",
      effect: "clear-room",
    });
  });
});
