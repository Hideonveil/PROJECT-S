import { supabaseAdmin } from "./supabase";
import type { GameIdentity, MatchRequest, NeedInput, Profile, PublicProfile } from "./types";

export function publicProfile(profile: Profile, games: GameIdentity[] = []): PublicProfile {
  return {
    id: profile.id,
    nickname: profile.nickname,
    handle: `${profile.nickname}#${profile.id.slice(-4).toUpperCase()}`,
    avatarKey: profile.avatar_key,
    device: profile.device,
    gender: profile.gender,
    playStyle: profile.play_style,
    voice: profile.voice,
    online: profile.online,
    friendCode: profile.friend_code,
    games,
  };
}

export async function gamesForProfile(profileId: string): Promise<GameIdentity[]> {
  const { data, error } = await supabaseAdmin()
    .from("user_games")
    .select("*")
    .eq("user_id", profileId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((g) => ({
    id: g.id,
    gameId: g.game_id,
    role: g.role || "",
    level: g.level || 0,
    winRate: g.win_rate || "-",
    note: g.note || "",
  }));
}

export async function publicProfilesFor(ids: string[]): Promise<PublicProfile[]> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return [];
  const { data: profiles } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .in("id", unique);
  if (!profiles) return [];
  const { data: gameRows } = await supabaseAdmin()
    .from("user_games")
    .select("*")
    .in("user_id", unique);
  const byProfile = new Map<string, GameIdentity[]>();
  for (const g of gameRows || []) {
    const list = byProfile.get(g.user_id) || [];
    list.push({
      id: g.id,
      gameId: g.game_id,
      role: g.role || "",
      level: g.level || 0,
      winRate: g.win_rate || "-",
      note: g.note || "",
    });
    byProfile.set(g.user_id, list);
  }
  return (profiles as Profile[])
    .map((p) => publicProfile(p, byProfile.get(p.id) || []))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "zh-Hans-CN"));
}

export function needFromRequest(r: MatchRequest): NeedInput {
  return {
    game: r.game_id,
    mode: r.activity || "",
    goal: r.goal || "",
    current: r.current_player_count,
    target: r.needed_player_count,
    time: r.play_time || "现在开始",
    duration: r.duration || "90",
    voice: r.voice_required,
    playerType: r.desired_player_type || "",
  };
}

export function scoreMatch(my: NeedInput, other: NeedInput): number {
  let score = 0;
  if (my.game === other.game) score += 40;
  if (my.mode && my.mode === other.mode) score += 20;
  if (my.time && my.time === other.time) score += 20;
  const targetCompatible =
    other.current + my.current <= other.target || my.current + other.current <= my.target;
  if (targetCompatible) score += 10;
  if (my.voice === other.voice) score += 5;
  if (my.goal && other.goal && my.goal === other.goal) score += 5;
  return Math.max(0, Math.min(100, score));
}

export function matchReasons(my: NeedInput, other: NeedInput): string[] {
  const reasons: string[] = [];
  if (my.game === other.game) reasons.push("同一游戏");
  if (my.mode && my.mode === other.mode) reasons.push("同一模式");
  if (my.voice === other.voice) reasons.push("语音需求一致");
  if (my.time && my.time === other.time) reasons.push("时间窗口一致");
  reasons.push(`人数互补：${other.current}/${other.target}`);
  return reasons.slice(0, 4);
}