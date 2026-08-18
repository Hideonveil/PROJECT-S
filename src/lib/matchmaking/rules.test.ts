import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state-machine";
import { evaluateCompatibility, rankCandidates } from "./rules";
import type { MatchTicket, MatchmakingRuleSet } from "./types";

const rules: MatchmakingRuleSet = {
  id: "rules-v1",
  gameId: "deadlock",
  version: "official-2024-11-21",
  hardRules: {
    allowedModes: ["ranked", "casual"],
    rankedPartyMax: 6,
    highRankThreshold: "ascendant_1",
    highRankPartyMax: 3,
    maxRankDistance: null,
    rankOrder: ["initiate", "seeker", "alchemist", "arcanist", "ritualist", "emissary", "archon", "oracle", "phantom", "ascendant", "eternus"],
  },
  softPreferences: { priority: ["desiredRoles", "microphonePreference"] },
  waitStrategy: { ticketTtlSeconds: 1800, confirmationTtlSeconds: 45, heartbeatTtlSeconds: 90, rejectedPairCooldownSeconds: 300 },
};

function ticket(overrides: Partial<MatchTicket> = {}): MatchTicket {
  return {
    id: crypto.randomUUID(), userId: crypto.randomUUID(), gameId: "deadlock", mode: "ranked",
    rankCode: "oracle", desiredRoles: [1], microphonePreference: "on", state: "searching",
    searchStartedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
  };
}

describe("Deadlock matchmaking skeleton", () => {
  it("1. leaves one player searchable without inventing a match", () => {
    expect(rankCandidates(ticket(), [], rules)).toEqual([]);
  });

  it("2. matches two fully compatible players", () => {
    expect(evaluateCompatibility(ticket(), ticket(), rules).compatible).toBe(true);
  });

  it("3. keeps soft preference mismatches eligible", () => {
    const result = evaluateCompatibility(ticket(), ticket({ desiredRoles: [6], microphonePreference: "off" }), rules);
    expect(result).toMatchObject({ compatible: true, softSignals: { desiredRoles: "mismatch", microphonePreference: "mismatch" } });
  });

  it("4. allows a separately configured official rank hard rule", () => {
    const strict = { ...rules, hardRules: { ...rules.hardRules, maxRankDistance: 1 } };
    expect(evaluateCompatibility(ticket({ rankCode: "initiate" }), ticket({ rankCode: "eternus" }), strict).hardFailures).toContain("rank_distance");
  });

  it("5. orders simultaneous players by configured preferences then wait time", () => {
    const source = ticket();
    const older = ticket({ desiredRoles: [6], searchStartedAt: "2026-01-01T00:00:00Z" });
    const preferred = ticket({ desiredRoles: [1], searchStartedAt: "2026-01-02T00:00:00Z" });
    expect(rankCandidates(source, [older, preferred], rules)[0].ticket.id).toBe(preferred.id);
  });

  it.each([
    ["6. cancel", "searching", "cancelled"],
    ["7. reject returns the peer", "waiting_confirmation", "searching"],
    ["8. confirmation timeout", "waiting_confirmation", "expired"],
    ["9. both confirm", "waiting_confirmation", "matched"],
    ["10. post-match exit", "matched", "cancelled"],
    ["11. reconnect remains searchable", "candidate_found", "searching"],
    ["14. request timeout", "searching", "expired"],
    ["15. game completion", "playing", "completed"],
  ] as const)("supports %s", (_name, from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it("12. rejects starting over an already active lifecycle", () => {
    expect(() => assertTransition("searching", "searching")).toThrow("INVALID_MATCH_TRANSITION");
  });

  it("13. never recommends a matched player", () => {
    expect(evaluateCompatibility(ticket(), ticket({ state: "matched" }), rules).hardFailures).toContain("not_searching");
  });

  it("has no undocumented escape from terminal states", () => {
    for (const state of ["completed", "cancelled", "expired"] as const) {
      expect(canTransition(state, "searching")).toBe(false);
    }
  });
});
