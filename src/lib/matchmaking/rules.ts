import type {
  CompatibilityResult,
  MatchTicket,
  MatchmakingInput,
  MatchmakingRuleSet,
  RankedCandidate,
} from "./types";

export function normalizeMatchmakingInput(input: Partial<MatchmakingInput>): MatchmakingInput {
  const mode = input.mode === "casual" ? "casual" : "ranked";
  const roles = Array.from(
    new Set((Array.isArray(input.desiredRoles) ? input.desiredRoles : []).map(Number).filter((role) => role >= 1 && role <= 6))
  ).sort((a, b) => a - b);
  const microphonePreference = ["on", "off", "any"].includes(String(input.microphonePreference))
    ? input.microphonePreference!
    : "any";
  return {
    gameId: "deadlock",
    mode,
    rankCode: mode === "ranked" && input.rankCode ? String(input.rankCode) : null,
    desiredRoles: roles,
    microphonePreference,
  };
}

function microphoneSignal(a: MatchTicket, b: MatchTicket) {
  if (a.microphonePreference === "any" || b.microphonePreference === "any") return "neutral" as const;
  return a.microphonePreference === b.microphonePreference ? "exact" as const : "mismatch" as const;
}

function roleSignal(a: MatchTicket, b: MatchTicket) {
  if (!a.desiredRoles.length || !b.desiredRoles.length) return "neutral" as const;
  return a.desiredRoles.some((role) => b.desiredRoles.includes(role)) ? "compatible" as const : "mismatch" as const;
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
    const maxDistance = rules.hardRules.maxRankDistance;
    if (maxDistance !== null && a.rankCode && b.rankCode) {
      const rankA = rules.hardRules.rankOrder.indexOf(a.rankCode);
      const rankB = rules.hardRules.rankOrder.indexOf(b.rankCode);
      if (rankA < 0 || rankB < 0 || Math.abs(rankA - rankB) > maxDistance) hardFailures.push("rank_distance");
    }
  }

  return {
    compatible: hardFailures.length === 0,
    hardFailures,
    softSignals: {
      desiredRoles: roleSignal(a, b),
      microphonePreference: microphoneSignal(a, b),
    },
  };
}

const signalOrder = { exact: 0, compatible: 1, neutral: 2, mismatch: 3 } as const;

export function rankCandidates(
  source: MatchTicket,
  candidates: MatchTicket[],
  rules: MatchmakingRuleSet
): RankedCandidate[] {
  return candidates
    .map((ticket) => ({ ticket, compatibility: evaluateCompatibility(source, ticket, rules) }))
    .filter((candidate) => candidate.compatibility.compatible)
    .sort((left, right) => {
      for (const preference of rules.softPreferences.priority) {
        const difference = signalOrder[left.compatibility.softSignals[preference]] - signalOrder[right.compatibility.softSignals[preference]];
        if (difference) return difference;
      }
      return new Date(left.ticket.searchStartedAt).getTime() - new Date(right.ticket.searchStartedAt).getTime();
    });
}
