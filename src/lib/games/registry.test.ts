import { describe, expect, it } from "vitest";
import { createGameRegistry } from "./registry";
import { deadlockGameDefinition } from "./deadlock";
import type { GameDefinition } from "./types";
import { evaluateCompatibility, normalizeMatchmakingInput } from "../matchmaking/rules";
import type { MatchTicket, MatchmakingRuleSet } from "../matchmaking/types";

const fakeGame: GameDefinition = {
  id: "fake-arena",
  displayName: "Fake Arena",
  assets: {},
  modes: {
    ranked: { enabled: true, hardMaxPlayers: 2, configurationSteps: ["rank", "position", "microphone"] },
    casual: { enabled: true, hardMaxPlayers: 4, configurationSteps: ["microphone", "preferredTotalPlayers"] },
  },
  vocabulary: {
    ranks: ["bronze", "silver"],
    positions: [1, 2],
  },
  roomCopy: { recruiting: "等待玩家中", locked: "人齐了" },
  capacityScenarios: [{ id: "mixed", rankedShare: 0.5, casualShare: 0.5 }],
  rules: {
    normalizeRankCode(value) {
      const rank = String(value || "").trim().toLowerCase();
      return ["bronze", "silver"].includes(rank) ? rank : null;
    },
    normalizePositions(values) {
      return Array.from(new Set((values || []).map(Number).filter((value) => [1, 2].includes(value))));
    },
    rankedHardFailures(a, b) {
      return a.rankCode === b.rankCode ? [] : ["rank_distance"];
    },
  },
};

function ticket(gameId: string, rankCode: string): MatchTicket {
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    gameId,
    mode: "ranked",
    state: "searching",
    rankCode,
    desiredRoles: [],
    ownRoles: [],
    teammateRoles: [],
    microphonePreference: "any",
    searchStartedAt: "2026-08-29T00:00:00.000Z",
    heartbeatAt: "2026-08-29T00:00:00.000Z",
    expiresAt: "2026-08-29T01:00:00.000Z",
  };
}

describe("game definition registry", () => {
  const registry = createGameRegistry([deadlockGameDefinition, fakeGame]);

  it("normalizes a future game through its adapter while preserving the shared Casual contract", () => {
    expect(normalizeMatchmakingInput({
      gameId: "fake-arena",
      mode: "casual",
      microphonePreference: "on",
      preferredTotalPlayers: 9,
    }, registry)).toMatchObject({
      gameId: "fake-arena",
      mode: "casual",
      microphonePreference: "on",
      preferredTotalPlayers: 4,
      recruitmentMode: "open",
    });
  });

  it("delegates game-specific Ranked rules without changing the shared matcher", () => {
    const rules: MatchmakingRuleSet = {
      id: "fake-rules",
      gameId: "fake-arena",
      version: "1",
      hardRules: {
        allowedModes: ["ranked", "casual"],
        rankedPartyMax: 2,
        highRankThreshold: null,
        highRankPartyMax: null,
        maxRankDistance: 0,
        rankOrder: ["bronze", "silver"],
      },
      softPreferences: { priority: ["desiredRoles", "microphonePreference"] },
      waitStrategy: { ticketTtlSeconds: 600, confirmationTtlSeconds: 30, heartbeatTtlSeconds: 60 },
    };

    expect(evaluateCompatibility(ticket("fake-arena", "bronze"), ticket("fake-arena", "bronze"), rules, registry).compatible).toBe(true);
    expect(evaluateCompatibility(ticket("fake-arena", "bronze"), ticket("fake-arena", "silver"), rules, registry).hardFailures).toContain("rank_distance");
    expect(evaluateCompatibility(ticket("deadlock", "initiate"), ticket("fake-arena", "bronze"), rules, registry).hardFailures).toContain("wrong_game");
  });
});
