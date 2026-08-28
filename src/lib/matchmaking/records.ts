import type {
  GroupMatchState,
  MatchGroup,
  MatchGroupMember,
  MatchMode,
  MatchState,
  MatchTicket,
  MatchmakingRuleSet,
} from "./types";

export type MatchmakingTicketRow = Record<string, any> & {
  id: string;
  user_id: string;
  game_id: "deadlock";
  mode: MatchMode;
  state: MatchState;
};

export type MatchmakingGroupRow = Record<string, any> & {
  id: string;
  owner_user_id: string;
  state: GroupMatchState;
};

export type MatchmakingRuleSetRow = Record<string, any> & {
  id: string;
  game_id: "deadlock";
  version: string;
};

export function ticketFromRow(row: MatchmakingTicketRow): MatchTicket {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const legacyRoles = Array.isArray(row.desired_roles) ? row.desired_roles : [];
  const hasOwnRoles = Array.isArray(metadata.ownRoles);
  const hasTeammateRoles = Array.isArray(metadata.teammateRoles);
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    mode: row.mode,
    rankCode: row.rank_code,
    desiredRoles: row.desired_roles || [],
    // Preserve the old desired_roles signal for tickets created before the
    // split role fields were introduced. New tickets always write both arrays,
    // including an explicit empty array for “不限”.
    ownRoles: hasOwnRoles ? metadata.ownRoles : legacyRoles,
    teammateRoles: hasTeammateRoles ? metadata.teammateRoles : legacyRoles,
    microphonePreference: row.microphone_preference,
    state: row.state,
    searchStartedAt: row.search_started_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    preferredTotalPlayers: Number.isInteger(Number(metadata.preferredTotalPlayers))
      ? Number(metadata.preferredTotalPlayers)
      : undefined,
    groupId: row.group_id || null,
  };
}

export function groupFromRow(row: MatchmakingGroupRow, members: MatchGroupMember[] = []): MatchGroup {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    state: row.state,
    gameId: row.game_id,
    mode: "casual",
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    confirmationDeadline: row.confirmation_deadline || null,
    roomId: row.room_id || null,
    sessionId: row.session_id || null,
    roomPhase: row.formation_state || null,
    hardMaxPlayers: Number(row.hard_max_players || 6),
    recruitmentMode: row.recruitment_mode || "open",
    members,
  };
}

export function rulesFromRow(row: MatchmakingRuleSetRow): MatchmakingRuleSet {
  return {
    id: row.id,
    gameId: row.game_id,
    version: row.version,
    hardRules: row.hard_rules,
    softPreferences: row.soft_preferences,
    waitStrategy: row.wait_strategy,
  };
}
