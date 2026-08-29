import { describe, expect, it } from "vitest";
import { createRoomAuthority } from "../public/js/room-authority.js";

describe("Room snapshot ordering", () => {
  it("does not let a delayed authoritative snapshot replace a newer Room version", () => {
    const authority = createRoomAuthority({
      normalizeRoom: (room: any) => room,
      roomSignature: (room: any) => JSON.stringify(room),
      isResumableRoom: () => true,
    });
    const current = { id: "room-1", realtimeVersion: 9, members: [{ id: "a" }] };
    authority.dispatch({ type: "snapshot", room: current, source: "start", route: "home" });

    expect(authority.dispatch({
      type: "snapshot",
      room: { id: "room-1", realtimeVersion: 8, members: [] },
      source: "hydration",
      route: "room",
    })).toMatchObject({ decision: "ignore", reason: "older-version", room: current });
  });
});
