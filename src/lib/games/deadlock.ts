import type { MatchTicket, MatchmakingRuleSet } from "../matchmaking/types";
import type { GameDefinition } from "./types";

export const DEADLOCK_RANK_CODES = [
  "initiate", "seeker", "alchemist", "arcanist", "ritualist", "emissary",
  "archon", "oracle", "phantom", "ascendant", "eternus",
] as const;

const DEADLOCK_RANK_NAMES = [
  ["新人", "砖石"],
  ["行者", "岩砾"],
  ["侍从", "镔铁"],
  ["近卫", "青铜"],
  ["秘士", "白银"],
  ["侍祭", "黄金"],
  ["蜜使", "铂金"],
  ["神谕者", "钻石"],
  ["幽虚影", ""],
  ["凌世君", ""],
  ["不朽之星", ""],
] as const;

const DEADLOCK_RANK_ASSETS = [
  ["/assets/ranks/01-initiate.png", 271, 320],
  ["/assets/ranks/02-seeker.png", 311, 320],
  ["/assets/ranks/03-acolyte.png", 262, 320],
  ["/assets/ranks/04-sentinel.png", 320, 234],
  ["/assets/ranks/05-mystic.png", 286, 320],
  ["/assets/ranks/06-ritualist.png", 320, 311],
  ["/assets/ranks/07-emissary.png", 277, 320],
  ["/assets/ranks/08-oracle.png", 320, 222],
  ["/assets/ranks/09-phantom.png", 279, 320],
  ["/assets/ranks/10-ascendant.png", 297, 320],
  ["/assets/ranks/11-eternus.png", 320, 301],
] as const;

const DEADLOCK_RANK_ART_CLASSES = [
  "match-rank-option--upper",
  "match-rank-option--upper match-rank-option--seeker",
  "match-rank-option--upper match-rank-option--acolyte",
  "match-rank-option--upper match-rank-option--sentinel",
  "match-rank-option--upper match-rank-option--second-row",
  "match-rank-option--upper match-rank-option--second-row",
  "match-rank-option--upper match-rank-option--second-row",
  "match-rank-option--upper match-rank-option--second-row match-rank-option--oracle",
  "match-rank-option--phantom",
  "",
  "",
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
  status: "available",
  category: "MOBA FPS",
  supportedClients: ["desktop"],
  icon: "swords",
  assets: {
    card: { src: "/assets/games/deadlock-card.jpg", width: 300, height: 450 },
    modes: {
      ranked: { src: "/assets/modes/rank-hero-card.jpg", width: 600, height: 529 },
      casual: { src: "/assets/modes/casual-hero-card.jpg", width: 600, height: 554 },
    },
  },
  modes: {
    ranked: {
      label: "冲分",
      enabled: true,
      hardMaxPlayers: 2,
      configurationSteps: ["rank", "position", "microphone"],
    },
    casual: {
      label: "休闲",
      enabled: true,
      hardMaxPlayers: 6,
      configurationSteps: ["microphone", "preferredTotalPlayers"],
    },
  },
  rankOptions: DEADLOCK_RANK_CODES.map((code, index) => {
    const [name, subtitle] = DEADLOCK_RANK_NAMES[index];
    const [src, width, height] = DEADLOCK_RANK_ASSETS[index];
    return {
      code,
      value: subtitle ? `${name}（${subtitle}）` : name,
      name,
      subtitle,
      asset: { src, width, height },
      artClass: DEADLOCK_RANK_ART_CLASSES[index],
    };
  }),
  positionOptions: [
    { code: 1, label: "1号位", roleLabel: "主核" },
    { code: 2, label: "2号位", roleLabel: "伪核" },
    { code: 3, label: "3号位", roleLabel: "坦克" },
    { code: 4, label: "4号位", roleLabel: "游走" },
    { code: 5, label: "5号位", roleLabel: "辅助" },
    { code: 6, label: "6号位", roleLabel: "功能" },
  ],
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
