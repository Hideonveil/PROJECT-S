import { describe, expect, it } from "vitest";
import { mapFriendshipRequests } from "./friendships";

describe("mapFriendshipRequests", () => {
  it("separates incoming requests from outgoing requests", () => {
    const profiles = new Map([
      ["a", { id: "a", nickname: "A" }],
      ["b", { id: "b", nickname: "B" }],
    ]);
    expect(mapFriendshipRequests("me", [
      { user_id: "a", friend_id: "me", created_at: "2026-08-19T01:00:00.000Z" },
      { user_id: "me", friend_id: "b", created_at: "2026-08-19T02:00:00.000Z" },
    ], profiles)).toEqual({
      incoming: [{ user: { id: "a", nickname: "A" }, createdAt: "2026-08-19T01:00:00.000Z" }],
      outgoing: [{ user: { id: "b", nickname: "B" }, createdAt: "2026-08-19T02:00:00.000Z" }],
    });
  });
});
