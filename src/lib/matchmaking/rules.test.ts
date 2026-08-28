import { describe, expect, it } from "vitest";
import { assertGroupTransition, assertTransition, canGroupTransition, canTransition, isTerminalGroupState } from "./state-machine";
import { evaluateCompatibility, normalizeMatchmakingInput, normalizeRankCode, rankCandidates } from "./rules";
import type { MatchTicket, MatchmakingRuleSet } from "./types";

const rules: MatchmakingRuleSet = {
  id: "rules-v1",
  gameId: "deadlock",
  version: "official-2024-11-21",
  hardRules: {
    allowedModes: ["ranked", "casual"],
    rankedPartyMax: 2,
    rankedTeammateMax: 1,
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

  it("enforces one adjacent rank when the legacy ruleset has no distance", () => {
    expect(evaluateCompatibility(ticket({ rankCode: "initiate" }), ticket({ rankCode: "oracle" }), rules).hardFailures)
      .toContain("rank_distance");
    expect(evaluateCompatibility(ticket({ rankCode: "oracle" }), ticket({ rankCode: "phantom" }), rules).compatible).toBe(true);
  });

  it("only allows Eternus to match Eternus", () => {
    expect(evaluateCompatibility(ticket({ rankCode: "eternus" }), ticket({ rankCode: "ascendant" }), rules).hardFailures)
      .toContain("rank_distance");
    expect(evaluateCompatibility(ticket({ rankCode: "eternus" }), ticket({ rankCode: "eternus" }), rules).compatible).toBe(true);
  });

  it("5. orders simultaneous players by configured preferences then wait time", () => {
    const source = ticket();
    const older = ticket({ desiredRoles: [6], searchStartedAt: "2026-01-01T00:00:00Z" });
    const preferred = ticket({ desiredRoles: [1], searchStartedAt: "2026-01-02T00:00:00Z" });
    expect(rankCandidates(source, [older, preferred], rules)[0].ticket.id).toBe(preferred.id);
  });

  it("keeps explicit role matching strict for the first ten seconds", () => {
    const source = ticket({
      ownRoles: [1],
      teammateRoles: [3, 4, 5],
      searchStartedAt: new Date().toISOString(),
    });
    const exact = ticket({
      ownRoles: [3],
      teammateRoles: [1],
    });
    const fallback = ticket({
      ownRoles: [2],
      teammateRoles: [1],
    });
    expect(rankCandidates(source, [fallback, exact], rules).map(({ ticket: candidate }) => candidate.id))
      .toEqual([exact.id]);
  });

  it("allows a role fallback after the source has waited ten seconds", () => {
    const source = ticket({
      ownRoles: [1],
      teammateRoles: [3, 4, 5],
      searchStartedAt: new Date(Date.now() - 11_000).toISOString(),
    });
    const fallback = ticket({
      ownRoles: [2],
      teammateRoles: [1],
    });
    expect(rankCandidates(source, [fallback], rules).map(({ ticket: candidate }) => candidate.id))
      .toEqual([fallback.id]);
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

  it("normalizes every Casual ticket into one recruiting pool", () => {
    expect(normalizeMatchmakingInput({
      mode: "casual",
      desiredTeammates: 1,
      minTeammates: 1,
      recruitmentMode: "rush",
      preferredTotalPlayers: 2,
      microphonePreference: "any",
    })).toMatchObject({
      desiredTeammates: 5,
      minTeammates: 1,
      recruitmentMode: "open",
      preferredTotalPlayers: 2,
    });
  });

  it("keeps casual teammate counts as preferences", () => {
    const casual = ticket({ mode: "casual", rankCode: null, desiredTeammates: 1, minTeammates: 1 });
    expect(evaluateCompatibility(casual, ticket({ mode: "casual", rankCode: null, desiredTeammates: 3, minTeammates: 3 }), rules).compatible).toBe(true);
    expect(evaluateCompatibility(casual, ticket({ mode: "casual", rankCode: null, desiredTeammates: 3, minTeammates: 1 }), rules).compatible).toBe(true);
  });

  it("sorts Casual candidates by preferred total without splitting compatibility", () => {
    const source = ticket({ mode: "casual", rankCode: null, preferredTotalPlayers: 3 });
    const otherSize = ticket({ mode: "casual", rankCode: null, preferredTotalPlayers: 6 });
    const sameSize = ticket({ mode: "casual", rankCode: null, preferredTotalPlayers: 3 });
    const ranked = rankCandidates(source, [otherSize, sameSize], rules);
    expect(ranked.map(({ ticket: candidate }) => candidate.id)).toEqual([sameSize.id, otherSize.id]);
    expect(ranked.every(({ compatibility }) => compatibility.compatible)).toBe(true);
  });

  it("keeps ranked mode as a duo queue", () => {
    expect(rules.hardRules.rankedPartyMax).toBe(2);
    expect(rules.hardRules.rankedTeammateMax).toBe(1);
    expect(normalizeMatchmakingInput({ mode: "ranked", desiredTeammates: 5 }))
      .toMatchObject({ mode: "ranked", desiredTeammates: undefined, minTeammates: undefined });
  });

  it("normalizes supported UI rank labels and rejects arbitrary ranks", () => {
    expect(normalizeRankCode("神谕者（钻石）")).toBe("oracle");
    expect(normalizeMatchmakingInput({ mode: "ranked", rankCode: "神谕者（钻石）" }).rankCode).toBe("oracle");
    expect(normalizeRankCode("not-a-real-rank")).toBeNull();
  });

  it("keeps the casual group lifecycle explicit", () => {
    expect(canGroupTransition("partial_ready", "forming")).toBe(true);
    expect(canGroupTransition("forming", "backfilling")).toBe(true);
    expect(canGroupTransition("backfilling", "locked")).toBe(true);
    expect(isTerminalGroupState("expired")).toBe(true);
    expect(() => assertGroupTransition("matched", "searching")).toThrow("INVALID_GROUP_MATCH_TRANSITION");
  });
});
