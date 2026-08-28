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

export const GROUP_MATCH_STATES = [
  "searching",
  "partial_ready",
  "forming",
  "backfilling",
  "locked",
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
export type GroupMatchState = (typeof GROUP_MATCH_STATES)[number];

export interface MatchmakingInput {
  gameId: "deadlock";
  mode: MatchMode;
  rankCode: string | null;
  desiredRoles: number[];
  /** Player's own role selection, retained for the Session fit readout. */
  ownRoles?: number[];
  /** Roles this player wants the teammate to fill, retained for the Session fit readout. */
  teammateRoles?: number[];
  microphonePreference: MicrophonePreference;
  /** Casual mode only. Upper bound for accepted teammates, excluding the owner. */
  desiredTeammates?: number;
  /** Casual mode only. Lower bound for accepted teammates, excluding the owner. */
  minTeammates?: number;
  /** Casual mode only. Controls recruitment priority, not compatibility rules. */
  recruitmentMode?: "open" | "rush" | "fill";
  /** Casual mode only. Soft preference for total Room size, including the player. */
  preferredTotalPlayers?: number;
}

export interface MatchTicket extends MatchmakingInput {
  id: string;
  userId: string;
  state: MatchState;
  searchStartedAt: string;
  heartbeatAt: string;
  expiresAt: string;
  desiredTeammates?: number;
  minTeammates?: number;
  groupId?: string | null;
}

export interface MatchGroupMember {
  userId: string;
  ticketId: string;
  isOwner: boolean;
  decision: ConfirmationDecision;
  joinedAt: string;
  respondedAt: string | null;
  rankCode?: string | null;
  microphonePreference?: MicrophonePreference;
  mode?: MatchMode;
  profile?: any;
}

export interface MatchGroup {
  id: string;
  ownerUserId: string;
  state: GroupMatchState;
  gameId: "deadlock";
  mode: "casual";
  /** Effective intersection of all current members' teammate ranges. */
  desiredTeammates: number;
  minTeammates: number;
  confirmationDeadline: string | null;
  roomId: string | null;
  sessionId: string | null;
  roomPhase?: "forming" | "backfilling" | "locked" | "formal" | null;
  hardMaxPlayers?: number;
  recruitmentMode?: string;
  roomCode?: string | null;
  members: MatchGroupMember[];
}

export interface MatchmakingRuleSet {
  id: string;
  gameId: "deadlock";
  version: string;
  hardRules: {
    allowedModes: MatchMode[];
    rankedPartyMax: number;
    rankedTeammateMax?: number;
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
