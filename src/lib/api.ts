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
  MatchRequest,
  NeedInput,
  Profile,
  PublicProfile,
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

export async function poolCounts(): Promise<{ online: number; matching: number; users: number }> {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const [{ count: matching }, { count: online }, { count: users }] = await Promise.all([
    supabaseAdmin().from("match_requests").select("id", { count: "exact", head: true }).eq("status", "matching"),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("online", true).gte("last_seen", recentCutoff),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }),
  ]);
  return { online: online ?? 0, matching: matching ?? 0, users: users ?? 0 };
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
    .select("user_id")
    .eq("room_id", room.id as string);
  const players = await publicProfilesFor((members || []).map((m) => m.user_id));
  return {
    id: room.id as string,
    code: room.code as string,
    need: (room.need as Record<string, unknown>) || {},
    status: room.status as string,
    started_at: (room.started_at as string | null) || null,
    startedAt: (room.started_at as string | null) || null,
    players,
  };
}

export async function activeRoomFor(profileId: string): Promise<Room | null> {
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("room_id")
    .eq("user_id", profileId);
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