import { describe, expect, it } from "vitest";
import { rosterDelta } from "../public/js/room-roster.js";

describe("Room roster delta", () => {
  it("reports a member joining from the authoritative live snapshot", () => {
    expect(rosterDelta([{ id: "a", nickname: "阿澈", memberStatus: "active" }], [
      { id: "a", nickname: "阿澈", memberStatus: "active" },
      { id: "b", nickname: "Borealis", memberStatus: "active" },
    ])).toEqual({ joined: [{ id: "b", nickname: "Borealis", memberStatus: "active" }], left: [] });
  });

  it("reports an exit instead of retaining a stale player", () => {
    expect(rosterDelta([
      { id: "a", nickname: "阿澈", memberStatus: "active" },
      { id: "b", nickname: "Borealis", memberStatus: "active" },
    ], [{ id: "b", nickname: "Borealis", memberStatus: "active" }])).toEqual({
      joined: [],
      left: [{ id: "a", nickname: "阿澈", memberStatus: "active" }],
    });
  });
});
