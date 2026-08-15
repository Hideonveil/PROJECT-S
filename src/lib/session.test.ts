import { describe, expect, it } from "vitest";
import { mapSession } from "./session";
import type { Session } from "./types";

it("maps a legacy active session as completed during the compatibility window", () => {
  const mapped = mapSession({
    id: "session-1",
    room_id: "room-1",
    room_code: "ABCDE",
    players: ["a", "b"],
    need: {},
    outcome_by: {},
    rematch_by: {},
    status: "active",
    started_at: null,
    ended_at: null,
    completed_by: null,
    completion_reason: null,
    source_session_id: null,
    resolution: "waiting",
    version: 1,
    created_at: new Date(0).toISOString(),
  } as Session);
  expect(mapped?.status).toBe("completed");
  expect(mapped?.roomId).toBe("room-1");
});

describe("session response shape", () => {
  it("preserves rematch resolution and version for stale-update detection", () => {
    const mapped = mapSession({
      id: "session-2",
      room_id: "room-2",
      room_code: "FGHIJ",
      players: ["a", "b"],
      need: {}, outcome_by: {}, rematch_by: { a: "yes" },
      status: "completed", started_at: null, ended_at: null,
      completed_by: "a", completion_reason: "explicit_finish",
      source_session_id: null, resolution: "waiting", version: 4,
      created_at: new Date(0).toISOString(),
    } as Session);
    expect(mapped).toMatchObject({ resolution: "waiting", version: 4, rematchBy: { a: "yes" } });
  });
});
