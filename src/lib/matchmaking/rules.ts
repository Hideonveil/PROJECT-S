import type {
  CompatibilityResult,
  MatchTicket,
  MatchmakingInput,
  MatchmakingRuleSet,
  RankedCandidate,
} from "./types";

export const DEADLOCK_RANK_CODES = [
  "initiate", "seeker", "alchemist", "arcanist", "ritualist", "emissary",
  "archon", "oracle", "phantom", "ascendant", "eternus",
] as const;

const DEFAULT_MAX_RANK_DISTANCE = 1;
const ETERNUS_RANK_CODE = "eternus";
/**
 * Keep the requested role pairing strict for the first few seconds, then
 * allow a compatible fallback so a player is not stranded indefinitely.
 */
export const ROLE_MATCH_FALLBACK_SECONDS = 10;

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

export function normalizeRankCode(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if ((DEADLOCK_RANK_CODES as readonly string[]).includes(raw)) return raw;
  return DEADLOCK_RANK_ALIASES[raw] || null;
}

export function normalizeMatchmakingInput(input: Partial<MatchmakingInput>): MatchmakingInput {
  const mode = input.mode === "casual" ? "casual" : "ranked";
  const roles = Array.from(
    new Set((Array.isArray(input.desiredRoles) ? input.desiredRoles : []).map(Number).filter((role) => role >= 1 && role <= 6))
  ).sort((a, b) => a - b);
  const ownRoles = Array.from(
    new Set((Array.isArray(input.ownRoles) ? input.ownRoles : []).map(Number).filter((role) => role >= 1 && role <= 6))
  ).sort((a, b) => a - b);
  const teammateRoles = Array.from(
    new Set((Array.isArray(input.teammateRoles) ? input.teammateRoles : []).map(Number).filter((role) => role >= 1 && role <= 6))
  ).sort((a, b) => a - b);
  const microphonePreference = ["on", "off", "any"].includes(String(input.microphonePreference))
    ? input.microphonePreference!
    : "any";
  // Casual has one recruiting pool. These legacy transport fields stay at
  // their canonical values so old clients cannot accidentally split it.
  const desiredTeammates = mode === "casual" ? 5 : undefined;
  const minTeammates = mode === "casual" ? 1 : undefined;
  const recruitmentMode = mode === "casual" ? "open" : undefined;
  const requestedTotalPlayers = Number(input.preferredTotalPlayers);
  const preferredTotalPlayers = mode === "casual" && Number.isInteger(requestedTotalPlayers)
    ? Math.min(6, Math.max(2, requestedTotalPlayers))
    : undefined;
  return {
    gameId: "deadlock",
    mode,
    rankCode: mode === "ranked" ? normalizeRankCode(input.rankCode) : null,
    desiredRoles: roles,
    ownRoles,
    teammateRoles,
    microphonePreference,
    desiredTeammates,
    minTeammates,
    recruitmentMode,
    preferredTotalPlayers,
  };
}

export function teammateRange(ticket: Pick<MatchTicket, "mode" | "desiredTeammates" | "minTeammates">) {
  if (ticket.mode !== "casual") return null;
  const max = Math.min(5, Math.max(1, Number(ticket.desiredTeammates) || 1));
  const min = Math.min(max, Math.max(1, Number(ticket.minTeammates) || max));
  return { min, max };
}

function microphoneSignal(a: MatchTicket, b: MatchTicket) {
  if (a.microphonePreference === "any" || b.microphonePreference === "any") return "neutral" as const;
  return a.microphonePreference === b.microphonePreference ? "exact" as const : "mismatch" as const;
}

function roleSignal(a: MatchTicket, b: MatchTicket) {
  // New tickets keep the player's own role and the role they want from a
  // teammate separately.  Legacy tickets only have desiredRoles, so retain
  // the old overlap semantics as a safe migration fallback.
  const hasExplicitRoles = Array.isArray(a.ownRoles) || Array.isArray(a.teammateRoles)
    || Array.isArray(b.ownRoles) || Array.isArray(b.teammateRoles);
  if (!hasExplicitRoles) {
    if (!a.desiredRoles.length || !b.desiredRoles.length) return "neutral" as const;
    return a.desiredRoles.some((role) => b.desiredRoles.includes(role)) ? "exact" as const : "mismatch" as const;
  }

  const ownA = Array.isArray(a.ownRoles) ? a.ownRoles : a.desiredRoles;
  const ownB = Array.isArray(b.ownRoles) ? b.ownRoles : b.desiredRoles;
  const expectedA = Array.isArray(a.teammateRoles) ? a.teammateRoles : a.desiredRoles;
  const expectedB = Array.isArray(b.teammateRoles) ? b.teammateRoles : b.desiredRoles;
  const satisfies = (expected: number[], own: number[]) =>
    !expected.length || !own.length || expected.some((role) => own.includes(role));
  const aSatisfied = satisfies(expectedA, ownB);
  const bSatisfied = satisfies(expectedB, ownA);
  if (aSatisfied && bSatisfied) return "exact" as const;
  if (aSatisfied || bSatisfied) return "compatible" as const;
  return "mismatch" as const;
}

function preferredTotalPlayersSignal(a: MatchTicket, b: MatchTicket) {
  const source = Number(a.preferredTotalPlayers);
  const candidate = Number(b.preferredTotalPlayers);
  if (!Number.isInteger(source) || !Number.isInteger(candidate)) return "neutral" as const;
  if (source === candidate) return "exact" as const;
  return Math.abs(source - candidate) <= 1 ? "compatible" as const : "mismatch" as const;
}

export function evaluateCompatibility(
  a: MatchTicket,
  b: MatchTicket,
  rules: MatchmakingRuleSet
): CompatibilityResult {
  const hardFailures: string[] = [];
  if (a.userId === b.userId) hardFailures.push("same_user");
  if (a.state !== "searching" || b.state !== "searching") hardFailures.push("not_searching");
  if (a.gameId !== rules.gameId || b.gameId !== rules.gameId) hardFailures.push("wrong_game");
  if (a.mode !== b.mode) hardFailures.push("different_mode");
  if (!rules.hardRules.allowedModes.includes(a.mode) || !rules.hardRules.allowedModes.includes(b.mode)) {
    hardFailures.push("unsupported_mode");
  }

  if (a.mode === "ranked") {
    if (!a.rankCode || !b.rankCode) hardFailures.push("rank_required");
    // A missing legacy value must not reopen unrestricted ranked matching.
    // The current product rule is one adjacent rank, with Eternus restricted
    // to Eternus only.  The DB ruleset is updated to the same value, but this
    // fallback keeps old rows safe during rollout and in manual-match paths.
    const maxDistance = Number.isInteger(rules.hardRules.maxRankDistance)
      ? rules.hardRules.maxRankDistance
      : DEFAULT_MAX_RANK_DISTANCE;
    if (maxDistance !== null && a.rankCode && b.rankCode) {
      const rankA = rules.hardRules.rankOrder.indexOf(a.rankCode);
      const rankB = rules.hardRules.rankOrder.indexOf(b.rankCode);
      const eternusPair = a.rankCode === ETERNUS_RANK_CODE || b.rankCode === ETERNUS_RANK_CODE;
      if (
        rankA < 0 ||
        rankB < 0 ||
        (eternusPair && a.rankCode !== b.rankCode) ||
        (!eternusPair && Math.abs(rankA - rankB) > maxDistance)
      ) hardFailures.push("rank_distance");
    }
  }
  // Casual teammate counts are preferences in Matching V2 Minimal. The game
  // hard cap is applied by the forming-room RPC; a requested group size must
  // not strand otherwise compatible players in separate pools.

  return {
    compatible: hardFailures.length === 0,
    hardFailures,
    softSignals: {
      desiredRoles: roleSignal(a, b),
      microphonePreference: microphoneSignal(a, b),
      preferredTotalPlayers: preferredTotalPlayersSignal(a, b),
    },
  };
}

const signalOrder = { exact: 0, compatible: 1, neutral: 2, mismatch: 3 } as const;

export function rankCandidates(
  source: MatchTicket,
  candidates: MatchTicket[],
  rules: MatchmakingRuleSet
): RankedCandidate[] {
  const startedAt = new Date(source.searchStartedAt).getTime();
  const ageSeconds = Number.isFinite(startedAt)
    ? Math.max(0, (Date.now() - startedAt) / 1000)
    : ROLE_MATCH_FALLBACK_SECONDS;
  const exactRolesOnly = ageSeconds < ROLE_MATCH_FALLBACK_SECONDS;
  return candidates
    .map((ticket) => ({ ticket, compatibility: evaluateCompatibility(source, ticket, rules) }))
    .filter((candidate) => candidate.compatibility.compatible)
    .filter((candidate) => !exactRolesOnly || candidate.compatibility.softSignals.desiredRoles === "exact")
    .sort((left, right) => {
      for (const preference of rules.softPreferences.priority) {
        const difference = signalOrder[left.compatibility.softSignals[preference]] - signalOrder[right.compatibility.softSignals[preference]];
        if (difference) return difference;
      }
      if (source.mode === "casual") {
        const difference = signalOrder[left.compatibility.softSignals.preferredTotalPlayers]
          - signalOrder[right.compatibility.softSignals.preferredTotalPlayers];
        if (difference) return difference;
      }
      return new Date(left.ticket.searchStartedAt).getTime() - new Date(right.ticket.searchStartedAt).getTime();
    });
}
