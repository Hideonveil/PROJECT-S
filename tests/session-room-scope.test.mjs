import { describe, expect, it } from "vitest";
import { sessionBelongsToRoom } from "../public/js/session-scope.js";

describe("browser Session scope", () => {
  it("rejects a terminal Session from the previous Room", () => {
    expect(sessionBelongsToRoom(
      { roomId: "room-old", roomCode: "OLD001", status: "completed" },
      { id: "room-new", code: "NEW001" },
    )).toBe(false);
  });

  it("accepts the current Room Session", () => {
    expect(sessionBelongsToRoom(
      { roomId: "room-new", roomCode: "NEW001", status: "completed" },
      { id: "room-new", code: "NEW001" },
    )).toBe(true);
  });
});
