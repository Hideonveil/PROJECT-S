export interface GameIdentity {
  id: string;
  gameId: string;
  role: string;
  level: number;
  winRate: string;
  note: string;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  username?: string | null;
  nickname: string;
  avatar_key: string;
  device: string;
  gender: string;
  age_range?: string;
  genres: string[];
  play_style: string;
  voice: boolean;
  online: boolean;
  last_seen: string | null;
  friend_code: string;
  game_accounts: Record<string, Record<string, string>> | null;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  username?: string | null;
  nickname: string;
  handle: string;
  avatarKey: string;
  device: string;
  gender: string;
  ageRange?: string;
  playStyle: string;
  voice: boolean;
  online: boolean;
  friendCode: string;
  genres: string[];
  games: GameIdentity[];
  gameAccounts: Record<string, Record<string, string>>;
}

export interface RoomMemberView extends PublicProfile {
  memberStatus: string;
  exitedAt: string | null;
}

export interface Room {
  id: string;
  code: string;
  need: Record<string, unknown>;
  status: string;
  started_at: string | null;
  startedAt: string | null;
  players: PublicProfile[];
  members: RoomMemberView[];
  sessionId?: string | null;
  sessionStatus?: string | null;
  /** User-facing recruitment signal; legacy formation/status fields remain compatibility data. */
  recruiting?: boolean;
  recruitmentState?: "recruiting" | "locked" | null;
  formationState?: "forming" | "backfilling" | "locked" | "formal" | null;
  formationGroupId?: string | null;
  isForming?: boolean;
  /** True only for the intentionally minimal first paint returned by start. */
  shell?: boolean;
  /** Monotonic database version used to discard delayed Room snapshots. */
  realtimeVersion?: number;
  resumeEligible?: boolean;
  goodbyeRequests: Array<{ userId: string; requestedAt: string }>;
  sessionSettlements?: Array<{ userId: string; kind: string; settledAt: string }>;
  recruitmentVotes?: Array<{ userId: string; requestedAt: string }>;
  recruitmentVoteCount?: number;
  recruitmentVoteTotal?: number;
  roomMembershipVersion?: number;
  currentMemberCount?: number;
  activeMemberCount?: number;
  targetTotalPlayers?: number;
}

export interface RecentConnection {
  id: string;
  user_id: string;
  friend_id: string;
  game_id: string;
  room_id: string | null;
  session_id: string | null;
  played_at: string;
  play_count: number;
  rating: string | null;
  want_again: boolean | null;
  created_at: string;
}

export interface EnrichedRecentConnection {
  player: PublicProfile;
  gameId: string;
  playedAt: string;
  playCount: number;
  rating: string | null;
  wantAgain: boolean | null;
}

export interface Session {
  id: string;
  room_id: string | null;
  room_code: string;
  players: string[];
  need: Record<string, unknown>;
  outcome_by: Record<string, string>;
  rematch_by: Record<string, string>;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  completed_by: string | null;
  completion_reason: string | null;
  source_session_id: string | null;
  resolution: "waiting" | "accepted" | "declined";
  version: number;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  username: string | null;
  user_email: string | null;
  feedback_type: string;
  content: string;
  contact_email: string | null;
  current_page: string | null;
  current_game: string | null;
  current_match_request_id: string | null;
  user_agent: string | null;
  created_at: string;
  email_status: string;
  email_sent_at: string | null;
  email_error: string | null;
}
