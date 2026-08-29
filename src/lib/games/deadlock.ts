import type { MatchTicket, MatchmakingRuleSet } from "../matchmaking/types";
import type { GameDefinition } from "./types";

export const DEADLOCK_RANK_CODES = [
  "initiate", "seeker", "alchemist", "arcanist", "ritualist", "emissary",
  "archon", "oracle", "phantom", "ascendant", "eternus",
] as const;

const DEFAULT_MAX_RANK_DISTANCE = 1;
const ETERNUS_RANK_CODE = "eternus";

const DEADLOCK_RANK_ALIASES: Record<string, (typeof DEADLOCK_RANK_CODES)[number]> = {
  "新人（砖石）": "initiate",
  "行者（岩砾）": "seeker",
  "侍从（镔铁）": "alchemist",
  "近卫（青铜）": "arcanist",
  "秘士（白银）": "ritualist",
  "侍祭（黄金）": "emissary",
  "蜜使（铂金）": "archon",
  "神谕者（钻石）": "oracle",
  "幽虚影": "phantom",
  "凌世君": "ascendant",
  "不朽之星": "eternus",
};

export function normalizeDeadlockRankCode(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if ((DEADLOCK_RANK_CODES as readonly string[]).includes(raw)) return raw;
  return DEADLOCK_RANK_ALIASES[raw] || null;
}

function normalizeDeadlockPositions(values: unknown[]) {
  return Array.from(new Set(values.map(Number).filter((role) => role >= 1 && role <= 6))).sort((a, b) => a - b);
}

function rankedHardFailures(a: MatchTicket, b: MatchTicket, rules: MatchmakingRuleSet) {
  const failures: string[] = [];
  if (!a.rankCode || !b.rankCode) {
    failures.push("rank_required");
    return failures;
  }
  const maxDistance = Number.isInteger(rules.hardRules.maxRankDistance)
    ? rules.hardRules.maxRankDistance
    : DEFAULT_MAX_RANK_DISTANCE;
  if (maxDistance === null) return failures;
  const rankA = rules.hardRules.rankOrder.indexOf(a.rankCode);
  const rankB = rules.hardRules.rankOrder.indexOf(b.rankCode);
  const eternusPair = a.rankCode === ETERNUS_RANK_CODE || b.rankCode === ETERNUS_RANK_CODE;
  if (
    rankA < 0
    || rankB < 0
    || (eternusPair && a.rankCode !== b.rankCode)
    || (!eternusPair && Math.abs(rankA - rankB) > maxDistance)
  ) failures.push("rank_distance");
  return failures;
}

export const deadlockGameDefinition: GameDefinition = {
  id: "deadlock",
  displayName: "Deadlock",
  assets: {
    card: "/images/games/deadlock.webp",
  },
  modes: {
    ranked: {
      enabled: true,
      hardMaxPlayers: 2,
      configurationSteps: ["rank", "position", "microphone"],
    },
    casual: {
      enabled: true,
      hardMaxPlayers: 6,
      configurationSteps: ["microphone", "preferredTotalPlayers"],
    },
  },
  vocabulary: {
    ranks: DEADLOCK_RANK_CODES,
    positions: [1, 2, 3, 4, 5, 6],
  },
  roomCopy: {
    recruiting: "等待玩家中",
    locked: "人齐了",
  },
  capacityScenarios: [
    { id: "mixed-ranked-casual", rankedShare: 0.5, casualShare: 0.5 },
  ],
  rules: {
    normalizeRankCode: normalizeDeadlockRankCode,
    normalizePositions: normalizeDeadlockPositions,
    rankedHardFailures,
  },
};
