import { describe, expect, it } from "vitest";
import { mapGoodbyeRequests, parseGoodbyeCommand } from "./session-goodbye";

describe("parseGoodbyeCommand", () => {
  it("accepts an explicit goodbye decision", () => {
    expect(parseGoodbyeCommand({ requested: true })).toEqual({ requested: true });
    expect(parseGoodbyeCommand({ requested: false })).toEqual({ requested: false });
  });

  it("rejects missing and truthy non-boolean decisions", () => {
    for (const input of [{}, { requested: "true" }]) {
      try {
        parseGoodbyeCommand(input);
        throw new Error("expected invalid goodbye command");
      } catch (error) {
        expect(error).toMatchObject({ code: "GOODBYE_REQUEST_INVALID" });
      }
    }
  });
});

describe("mapGoodbyeRequests", () => {
  it("exposes a stable camel-cased room view and ignores malformed rows", () => {
    expect(
      mapGoodbyeRequests([
        { user_id: "player-b", requested_at: "2026-08-19T02:00:00.000Z" },
        { user_id: "player-a", requested_at: "2026-08-19T01:00:00.000Z" },
        { user_id: null, requested_at: "2026-08-19T00:00:00.000Z" },
      ])
    ).toEqual([
      { userId: "player-a", requestedAt: "2026-08-19T01:00:00.000Z" },
      { userId: "player-b", requestedAt: "2026-08-19T02:00:00.000Z" },
    ]);
  });
});
