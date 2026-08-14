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
  nickname: string;
  avatar_key: string;
  device: string;
  gender: string;
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
  nickname: string;
  handle: string;
  avatarKey: string;
  device: string;
  gender: string;
  playStyle: string;
  voice: boolean;
  online: boolean;
  friendCode: string;
  genres: string[];
  games: GameIdentity[];
  gameAccounts: Record<string, Record<string, string>>;
}

export interface NeedInput {
  game: string;
  mode: string;
  goal: string;
  current: number;
  target: number;
  time: string;
  duration: string;
  voice: boolean;
  playerType: string;
  details?: Record<string, unknown>;
}

export interface MatchRequest {
  id: string;
  user_id: string;
  game_id: string;
  activity: string;
  goal: string;
  current_player_count: number;
  needed_player_count: number;
  play_time: string;
  duration: string;
  voice_required: boolean;
  desired_player_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  details: Record<string, unknown> | null;
}

export interface Candidate {
  id: string;
  kind: string;
  nickname: string;
  handle: string;
  avatarKey: string;
  device: string;
  online: boolean;
  friendCode: string;
  genres: string[];
  games: GameIdentity[];
  need: {
    game: string;
    mode: string;
    goal: string;
    current: number;
    target: number;
    time: string;
    duration: string;
    voice: boolean;
    playerType: string;
    details?: Record<string, unknown>;
  };
  matchScore: number;
  reasons: string[];
}

export interface Application {
  id: string;
  from_user_id: string;
  to_user_id: string;
  match_request_id: string | null;
  status: string;
  created_at: string;
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
}

export interface RecentConnection {
  id: string;
  user_id: string;
  friend_id: string;
  game_id: string;
  room_id: string | null;
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
  room_code: string;
  players: string[];
  need: Record<string, unknown>;
  outcome_by: Record<string, string>;
  rematch_by: Record<string, string>;
  status: string;
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