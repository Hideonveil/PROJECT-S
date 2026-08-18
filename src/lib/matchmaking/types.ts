export const MATCH_STATES = [
  "idle",
  "searching",
  "candidate_found",
  "waiting_confirmation",
  "matched",
  "playing",
  "completed",
  "cancelled",
  "expired",
] as const;

export type MatchState = (typeof MATCH_STATES)[number];
export type MatchMode = "ranked" | "casual";
export type MicrophonePreference = "on" | "off" | "any";
export type ConfirmationDecision = "pending" | "accepted" | "rejected";

export interface MatchmakingInput {
  gameId: "deadlock";
  mode: MatchMode;
  rankCode: string | null;
  desiredRoles: number[];
  microphonePreference: MicrophonePreference;
}

export interface MatchTicket extends MatchmakingInput {
  id: string;
  userId: string;
  state: MatchState;
  searchStartedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface MatchmakingRuleSet {
  id: string;
  gameId: "deadlock";
  version: string;
  hardRules: {
    allowedModes: MatchMode[];
    rankedPartyMax: number;
    highRankThreshold: string | null;
    highRankPartyMax: number | null;
    maxRankDistance: number | null;
    rankOrder: string[];
  };
  softPreferences: {
    priority: Array<"desiredRoles" | "microphonePreference">;
  };
  waitStrategy: {
    ticketTtlSeconds: number;
    confirmationTtlSeconds: number;
    heartbeatTtlSeconds: number;
    rejectedPairCooldownSeconds?: number;
  };
}

export interface CompatibilityResult {
  compatible: boolean;
  hardFailures: string[];
  softSignals: Record<string, "exact" | "compatible" | "neutral" | "mismatch">;
}

export interface RankedCandidate {
  ticket: MatchTicket;
  compatibility: CompatibilityResult;
}
