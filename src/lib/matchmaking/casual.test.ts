import { describe, expect, it } from "vitest";
import { rankCasualConsolidationTargets } from "./casual";

describe("Casual singleton consolidation", () => {
  it("moves a singleton toward an already forming compatible Room first", () => {
    expect(rankCasualConsolidationTargets("group-b", 1, [
      { id: "group-a", memberCount: 1, created_at: "2026-08-29T00:00:00Z" },
      { id: "group-c", memberCount: 2, created_at: "2026-08-29T00:00:01Z" },
    ]).map((group) => group.id)).toEqual(["group-c", "group-a"]);
  });

  it("uses one deterministic direction when both groups are singletons", () => {
    expect(rankCasualConsolidationTargets("group-b", 1, [
      { id: "group-c", memberCount: 1, created_at: "2026-08-29T00:00:00Z" },
      { id: "group-a", memberCount: 1, created_at: "2026-08-29T00:00:01Z" },
    ]).map((group) => group.id)).toEqual(["group-a"]);
  });

  it("never moves a group that already has multiple members", () => {
    expect(rankCasualConsolidationTargets("group-b", 2, [
      { id: "group-c", memberCount: 3, created_at: "2026-08-29T00:00:00Z" },
    ])).toEqual([]);
  });
});
