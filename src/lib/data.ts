import { supabaseAdmin } from "./supabase";
import type { GameIdentity, Profile, PublicProfile } from "./types";

export function publicProfile(
  profile: Profile,
  games: GameIdentity[] = [],
  options: { includePrivate?: boolean; includeGameAccounts?: boolean } = {}
): PublicProfile {
  return {
    id: profile.id,
    nickname: profile.nickname,
    handle: `${profile.nickname}#${profile.id.slice(-4).toUpperCase()}`,
    avatarKey: profile.avatar_key,
    device: profile.device,
    gender: profile.gender,
    ageRange: profile.age_range || "保密",
    playStyle: profile.play_style,
    voice: profile.voice,
    online: profile.online,
    friendCode: options.includePrivate ? profile.friend_code : "",
    genres: Array.isArray(profile.genres) ? profile.genres : [],
    games,
    gameAccounts: options.includePrivate || options.includeGameAccounts
      ? ((profile.game_accounts || {}) as Record<string, Record<string, string>>)
      : {},
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

export async function publicProfilesFor(
  ids: string[],
  options: { includePrivateFor?: string[]; includeGameAccountsFor?: string[] } = {}
): Promise<PublicProfile[]> {
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
  const privateIds = new Set(options.includePrivateFor || []);
  const accountIds = new Set(options.includeGameAccountsFor || []);
  return (profiles as Profile[])
    .map((p) => publicProfile(p, byProfile.get(p.id) || [], {
      includePrivate: privateIds.has(p.id),
      includeGameAccounts: accountIds.has(p.id),
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "zh-Hans-CN"));
}
