import type {
  CompatibilityResult,
  MatchTicket,
  MatchmakingInput,
  MatchmakingRuleSet,
  RankedCandidate,
} from "./types";
import { gameRegistry } from "../games/registry";
import type { GameRegistry } from "../games/types";
import { DEADLOCK_RANK_CODES, normalizeDeadlockRankCode } from "../games/deadlock";

export { DEADLOCK_RANK_CODES };
/**
 * Keep the requested role pairing strict for the first few seconds, then
 * allow a compatible fallback so a player is not stranded indefinitely.
 */
export const ROLE_MATCH_FALLBACK_SECONDS = 10;

export function normalizeRankCode(value: unknown): string | null {
  return normalizeDeadlockRankCode(value);
}

export function normalizeMatchmakingInput(input: Partial<MatchmakingInput>, registry: GameRegistry = gameRegistry): MatchmakingInput {
  const defaultGame = registry.list().find((game) => (
    game.status === "available" && Object.values(game.modes).some((mode) => mode.enabled)
  ));
  const gameId = String(input.gameId || defaultGame?.id || "").trim();
  const game = registry.require(gameId);
  const mode = input.mode === "casual" ? "casual" : "ranked";
  if (!game.modes[mode].enabled) throw new Error(`GAME_MODE_UNSUPPORTED:${gameId}:${mode}`);
  const roles = game.rules.normalizePositions(Array.isArray(input.desiredRoles) ? input.desiredRoles : []);
  const ownRoles = game.rules.normalizePositions(Array.isArray(input.ownRoles) ? input.ownRoles : []);
  const teammateRoles = game.rules.normalizePositions(Array.isArray(input.teammateRoles) ? input.teammateRoles : []);
  const microphonePreference = ["on", "off", "any"].includes(String(input.microphonePreference))
    ? input.microphonePreference!
    : "any";
  // Casual has one recruiting pool. These legacy transport fields stay at
  // their canonical values so old clients cannot accidentally split it.
  const desiredTeammates = mode === "casual" ? game.modes.casual.hardMaxPlayers - 1 : undefined;
  const minTeammates = mode === "casual" ? 1 : undefined;
  const recruitmentMode = mode === "casual" ? "open" : undefined;
  const requestedTotalPlayers = Number(input.preferredTotalPlayers);
  const preferredTotalPlayers = mode === "casual" && Number.isInteger(requestedTotalPlayers)
    ? Math.min(game.modes.casual.hardMaxPlayers, Math.max(2, requestedTotalPlayers))
    : undefined;
  return {
    gameId,
    mode,
    rankCode: mode === "ranked" ? game.rules.normalizeRankCode(input.rankCode) : null,
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
  rules: MatchmakingRuleSet,
  registry: GameRegistry = gameRegistry
): CompatibilityResult {
  const hardFailures: string[] = [];
  if (a.userId === b.userId) hardFailures.push("same_user");
  if (a.state !== "searching" || b.state !== "searching") hardFailures.push("not_searching");
  if (a.gameId !== rules.gameId || b.gameId !== rules.gameId) hardFailures.push("wrong_game");
  if (a.mode !== b.mode) hardFailures.push("different_mode");
  if (!rules.hardRules.allowedModes.includes(a.mode) || !rules.hardRules.allowedModes.includes(b.mode)) {
    hardFailures.push("unsupported_mode");
  }

  if (a.mode === "ranked" && a.gameId === b.gameId && a.gameId === rules.gameId) {
    const game = registry.get(rules.gameId);
    if (!game) hardFailures.push("unsupported_game");
    else hardFailures.push(...game.rules.rankedHardFailures(a, b, rules));
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
  rules: MatchmakingRuleSet,
  registry: GameRegistry = gameRegistry
): RankedCandidate[] {
  const startedAt = new Date(source.searchStartedAt).getTime();
  const ageSeconds = Number.isFinite(startedAt)
    ? Math.max(0, (Date.now() - startedAt) / 1000)
    : ROLE_MATCH_FALLBACK_SECONDS;
  const exactRolesOnly = ageSeconds < ROLE_MATCH_FALLBACK_SECONDS;
  return candidates
    .map((ticket) => ({ ticket, compatibility: evaluateCompatibility(source, ticket, rules, registry) }))
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
