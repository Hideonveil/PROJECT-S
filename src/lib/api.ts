import { supabaseAdmin } from "./supabase";
import { gamesForProfile, publicProfile, publicProfilesFor } from "./data";
import { mapGoodbyeRequests } from "./session-goodbye";
import type {
  EnrichedRecentConnection,
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

export async function poolCounts(): Promise<{ online: number; matching: number; users: number; playing: number }> {
  const [{ count: matching }, { count: online }, { count: users }, { data: playingSessions }] = await Promise.all([
    supabaseAdmin().from("matchmaking_tickets").select("id", { count: "exact", head: true }).in("state", ["searching", "candidate_found", "waiting_confirmation"]),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("online", true),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin().from("sessions").select("room_id").eq("status", "playing"),
  ]);
  // A room shell intentionally remains visible after one member exits so the
  // other member can see what happened. Only a genuinely playing Session is
  // therefore allowed to contribute to the live playing count.
  const roomIds = Array.from(new Set((playingSessions || []).map((session) => session.room_id).filter(Boolean)));
  const { count: playing } = roomIds.length
    ? await supabaseAdmin().from("room_members").select("id", { count: "exact", head: true }).eq("status", "active").in("room_id", roomIds)
    : { count: 0 };
  return { online: online ?? 0, matching: matching ?? 0, users: users ?? 0, playing: playing ?? 0 };
}

export async function enrichRoom(room: Record<string, unknown>): Promise<Room> {
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("user_id,status,exited_at")
    .eq("room_id", room.id as string)
    .order("joined_at", { ascending: true });
  const rows = (members || []) as Array<{ user_id: string; status: string; exited_at: string | null }>;
  // enrichRoom is only called after server-side room membership checks, so
  // members may see each other's in-room game account exchange fields.
  const memberIds = rows.map((m) => m.user_id);
  const profiles = await publicProfilesFor(memberIds, { includeGameAccountsFor: memberIds });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const memberViews = rows
    .filter((m) => byId.has(m.user_id))
    .map((m) => ({
      ...(byId.get(m.user_id) as PublicProfile),
      memberStatus: m.status || "active",
      exitedAt: m.exited_at || null,
    }));
  const { data: session } = await supabaseAdmin()
    .from("sessions")
    .select("id,status")
    .eq("room_id", room.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: goodbyeRows } = session?.id
    ? await supabaseAdmin()
        .from("session_goodbye_requests")
        .select("user_id,requested_at")
        .eq("session_id", session.id)
        .order("requested_at", { ascending: true })
    : { data: [] };
  return {
    id: room.id as string,
    code: room.code as string,
    need: (room.need as Record<string, unknown>) || {},
    status: room.status as string,
    started_at: (room.started_at as string | null) || null,
    startedAt: (room.started_at as string | null) || null,
    players: memberViews.filter((m) => m.memberStatus === "active"),
    members: memberViews,
    sessionId: session?.id || null,
    sessionStatus: session?.status || null,
    goodbyeRequests: mapGoodbyeRequests(goodbyeRows || []),
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
  const sessionIds = Array.from(new Set(rows.map((row) => row.session_id).filter(Boolean))) as string[];
  const { data: responses } = sessionIds.length
    ? await supabaseAdmin()
        .from("session_responses")
        .select("session_id,rating,want_again")
        .eq("user_id", profileId)
        .in("session_id", sessionIds)
    : { data: [] };
  const responseBySession = new Map((responses || []).map((row) => [row.session_id, row]));
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
        rating: responseBySession.get(entry.row.session_id || "")?.rating ?? entry.row.rating,
        wantAgain: responseBySession.get(entry.row.session_id || "")?.want_again ?? entry.row.want_again,
      };
    })
    .filter((entry): entry is EnrichedRecentConnection => entry !== null);
}

export async function activeSessionFor(profileId: string): Promise<Session | null> {
  const { data: memberships } = await supabaseAdmin()
    .from("room_members")
    .select("room_id")
    .eq("user_id", profileId)
    .order("joined_at", { ascending: false });
  const roomIds = (memberships || []).map((row) => row.room_id);
  if (!roomIds.length) return null;
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .in("room_id", roomIds)
    .in("status", ["ready", "playing", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Session) || null;
}

export async function friendsFor(profileId: string): Promise<PublicProfile[]> {
  const { data } = await supabaseAdmin()
    .from("friendships")
    .select("friend_id")
    .eq("user_id", profileId)
    .eq("status", "accepted");
  return publicProfilesFor((data || []).map((f) => f.friend_id));
}

export async function profileWithGames(profile: Profile): Promise<PublicProfile> {
  const games = await gamesForProfile(profile.id);
  return publicProfile(profile, games, { includePrivate: true });
}
