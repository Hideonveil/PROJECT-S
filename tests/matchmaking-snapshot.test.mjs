import { describe, expect, it } from "vitest";
import {
  isLiveMatchmakingSnapshot,
  matchmakingShape,
  mergeMatchmakingSnapshot,
  mergePartialMatchmakingSnapshot,
} from "../public/js/matchmaking-snapshot.js";

const previous = {
  status: "active",
  online: 2,
  pool: 2,
  matchable: 1,
  directory: [],
  lifecycle: { id: "ticket-old", state: "searching" },
  pair: null,
  group: { id: "group-old", state: "forming" },
  candidate: null,
  notice: "",
};

describe("matchmaking snapshot merge", () => {
  it("rejects expired and terminal matchmaking snapshots", () => {
    expect(isLiveMatchmakingSnapshot({ state: "searching", expires_at: "2026-01-01T00:00:00Z" }, null, null, Date.parse("2026-01-02T00:00:00Z"))).toBe(false);
    expect(isLiveMatchmakingSnapshot({ state: "searching" }, { state: "completed" })).toBe(false);
  });

  it("connects a live pair and its candidate atomically in local state", () => {
    const merged = mergeMatchmakingSnapshot(previous, {
      ticket: { id: "ticket-new", state: "matched" },
      pair: { id: "pair-1", state: "matched" },
      candidate: { id: "user-b" },
    });
    expect(merged.match).toMatchObject({
      status: "active",
      lifecycle: { id: "ticket-new" },
      pair: { id: "pair-1" },
      candidate: { id: "user-b" },
    });
  });

  it("preserves a live group when a legacy endpoint omits group state", () => {
    const merged = mergePartialMatchmakingSnapshot(previous, { ...previous, online: 3 }, { ticket: null });
    expect(merged.partial).toBe(true);
    expect(merged.match.status).toBe("active");
    expect(merged.match.group).toEqual(previous.group);
    expect(merged.match.lifecycle).toEqual(previous.lifecycle);
  });

  it("changes shape when participant confirmation state changes", () => {
    const before = { pair: { id: "pair-1", confirmations: [{ user_id: "a", decision: "pending" }] } };
    const after = { pair: { id: "pair-1", confirmations: [{ user_id: "a", decision: "accepted" }] } };
    expect(matchmakingShape(before)).not.toBe(matchmakingShape(after));
  });
});
