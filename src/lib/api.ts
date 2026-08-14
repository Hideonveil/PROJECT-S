import { supabaseAdmin } from "./supabase";
import {
  gamesForProfile,
  matchReasons,
  needFromRequest,
  publicProfile,
  publicProfilesFor,
  scoreMatch,
} from "./data";
import type {
  Application,
  EnrichedRecentConnection,
  MatchRequest,
  NeedInput,
  Profile,
  PublicProfile,
  RecentConnection,
  Room,
  Session,
} from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPart(length: number): string {
  return Array.from({ length }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
}

export function generateFriendCode(): string {
  return `NODE-${randomPart(4)}-${randomPart(4)}`;
}

export function generateRoomCode(): string {
  return randomPart(5);
}

export async function poolCounts(): Promise<{ online: number; matching: number; users: number; playing: number }> {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const [{ count: matching }, { count: online }, { count: users }, { data: playingRooms }] = await Promise.all([
    supabaseAdmin().from("match_requests").select("id", { count: "exact", head: true }).eq("status", "matching").gt("expires_at", new Date().toISOString()),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("online", true).gte("last_seen", recentCutoff),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin().from("rooms").select("id").eq("status", "playing"),
  ]);
  const roomIds = (playingRooms || []).map((r) => r.id);
  const { count: playing } = roomIds.length
    ? await supabaseAdmin().from("room_members").select("id", { count: "exact", head: true }).eq("status", "active").in("room_id", roomIds)
    : { count: 0 };
  return { online: online ?? 0, matching: matching ?? 0, users: users ?? 0, playing: playing ?? 0 };
}

export async function activeRequest(profileId: string): Promise<MatchRequest | null> {
  const { data, error } = await supabaseAdmin()
    .from("match_requests")
    .select("*")
    .eq("user_id", profileId)
    .in("status", ["matching", "matched"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as MatchRequest;
}

export async function publicNeeds(): Promise<Array<{ user: PublicProfile; need: NeedInput }>> {
  const { data } = await supabaseAdmin()
    .from("match_requests")
    .select("*")
    .eq("status", "matching")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const rows = (data || []) as MatchRequest[];
  const profiles = await publicProfilesFor(rows.map((r) => r.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows
    .filter((r) => byId.has(r.user_id))
    .map((r) => ({ user: byId.get(r.user_id) as PublicProfile, need: needFromRequest(r) }));
}

export async function candidatesFor(myProfile: Profile, myNeed: NeedInput) {
  const { data } = await supabaseAdmin()
    .from("match_requests")
    .select("*")
    .eq("status", "matching")
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", myProfile.id)
    .order("created_at", { ascending: false });
  const rows = (data || []) as MatchRequest[];
  const out: Array<PublicProfile & { need: NeedInput; matchScore: number; reasons: string[]; kind: string }> = [];
  for (const row of rows) {
    const other = needFromRequest(row);
    if (other.game !== myNeed.game) continue;
    const profile = (await publicProfilesFor([row.user_id]))[0];
    if (!profile) continue;
    out.push({
      ...profile,
      kind: "player",
      need: other,
      matchScore: scoreMatch(myNeed, other),
      reasons: matchReasons(myNeed, other),
    });
  }
  out.sort((a, b) => b.matchScore - a.matchScore);
  return out.slice(0, 6);
}

export async function enrichRoom(room: Record<string, unknown>): Promise<Room> {
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("user_id,status,exited_at")
    .eq("room_id", room.id as string)
    .order("joined_at", { ascending: true });
  const rows = (members || []) as Array<{ user_id: string; status: string; exited_at: string | null }>;
  const profiles = await publicProfilesFor(rows.map((m) => m.user_id));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const memberViews = rows
    .filter((m) => byId.has(m.user_id))
    .map((m) => ({
      ...(byId.get(m.user_id) as PublicProfile),
      memberStatus: m.status || "active",
      exitedAt: m.exited_at || null,
    }));
  return {
    id: room.id as string,
    code: room.code as string,
    need: (room.need as Record<string, unknown>) || {},
    status: room.status as string,
    started_at: (room.started_at as string | null) || null,
    startedAt: (room.started_at as string | null) || null,
    players: memberViews.filter((m) => m.memberStatus === "active"),
    members: memberViews,
  };
}

export async function activeRoomFor(profileId: string): Promise<Room | null> {
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("room_id")
    .eq("user_id", profileId)
    .eq("status", "active");
  const roomIds = (members || []).map((m) => m.room_id);
  if (!roomIds.length) return null;
  const { data: rooms } = await supabaseAdmin()
    .from("rooms")
    .select("*")
    .in("id", roomIds)
    .in("status", ["connecting", "ready", "playing"])
    .order("created_at", { ascending: false })
    .limit(1);
  const room = rooms?.[0];
  if (!room) return null;
  return enrichRoom(room);
}

export async function recentConnectionsFor(profileId: string): Promise<EnrichedRecentConnection[]> {
  const { data } = await supabaseAdmin()
    .from("recent_connections")
    .select("*")
    .eq("user_id", profileId)
    .order("played_at", { ascending: false });
  const rows = (data || []) as RecentConnection[];
  const grouped = new Map<string, { row: RecentConnection; playCount: number }>();
  for (const row of rows) {
    const current = grouped.get(row.friend_id);
    if (!current) {
      grouped.set(row.friend_id, { row, playCount: row.play_count });
      continue;
    }
    current.playCount += row.play_count;
    if (new Date(row.played_at).getTime() > new Date(current.row.played_at).getTime()) {
      current.row = row;
    }
  }
  const profiles = await publicProfilesFor(Array.from(grouped.keys()));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return Array.from(grouped.entries())
    .map(([friendId, entry]) => {
      const player = byId.get(friendId);
      if (!player) return null;
      return {
        player,
        gameId: entry.row.game_id,
        playedAt: entry.row.played_at,
        playCount: entry.playCount,
        rating: entry.row.rating,
        wantAgain: entry.row.want_again,
      };
    })
    .filter((entry): entry is EnrichedRecentConnection => entry !== null);
}

export async function recordRoomConnection(room: Record<string, unknown>): Promise<void> {
  const gameId = String((room.need as Record<string, unknown>)?.game || "");
  if (!gameId) return;
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("user_id")
    .eq("room_id", room.id as string);
  const ids = Array.from(new Set((members || []).map((m) => m.user_id)));
  if (ids.length < 2) return;
  const rows: Array<{ user_id: string; friend_id: string; game_id: string; room_id: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      rows.push({ user_id: ids[i], friend_id: ids[j], game_id: gameId, room_id: room.id as string });
      rows.push({ user_id: ids[j], friend_id: ids[i], game_id: gameId, room_id: room.id as string });
    }
  }
  if (!rows.length) return;
  await supabaseAdmin().from("recent_connections").upsert(rows, {
    onConflict: "user_id,friend_id,room_id",
    ignoreDuplicates: true,
  });
}

export async function activeSessionFor(profileId: string): Promise<Session | null> {
  const { data } = await supabaseAdmin().from("sessions").select("*").order("created_at", { ascending: false });
  const rows = (data || []) as Session[];
  const mine = rows.find((s) => (s.players || []).includes(profileId) && s.status === "active");
  return mine || null;
}

export async function enrichedApplications(apps: Application[]) {
  const ids = Array.from(new Set(apps.flatMap((a) => [a.from_user_id, a.to_user_id])));
  const profiles = await publicProfilesFor(ids);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const needsByUser = new Map<string, NeedInput>();
  for (const id of ids) {
    const req = await activeRequest(id);
    if (req) needsByUser.set(id, needFromRequest(req));
  }
  return apps.map((a) => {
    const from = byId.get(a.from_user_id) || null;
    return {
      id: a.id,
      status: a.status,
      createdAt: a.created_at,
      from: from ? { ...from, need: needsByUser.get(a.from_user_id) || null } : null,
      to: byId.get(a.to_user_id) || null,
    };
  });
}

export async function friendsFor(profileId: string): Promise<PublicProfile[]> {
  const { data } = await supabaseAdmin().from("friendships").select("friend_id").eq("user_id", profileId);
  return publicProfilesFor((data || []).map((f) => f.friend_id));
}

export async function profileWithGames(profile: Profile): Promise<PublicProfile> {
  const games = await gamesForProfile(profile.id);
  return publicProfile(profile, games);
}