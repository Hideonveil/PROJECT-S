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
  play_style: string;
  voice: boolean;
  online: boolean;
  last_seen: string | null;
  friend_code: string;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  nickname: string;
  handle: string;
  avatarKey: string;
  device: string;
  playStyle: string;
  voice: boolean;
  online: boolean;
  friendCode: string;
  games: GameIdentity[];
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

export interface Room {
  id: string;
  code: string;
  need: Record<string, unknown>;
  status: string;
  started_at: string | null;
  startedAt: string | null;
  players: PublicProfile[];
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