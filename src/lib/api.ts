import { supabaseAdmin } from "./supabase";
import { gamesForProfile, publicProfile, publicProfilesFor, type ReadContext } from "./data";
import { mapSession } from "./session";
import { presenceCutoffIso } from "./presence";
import { enrichRoom, resolveActiveRoom, type StateReadContext } from "./room-read-model";
import type {
  EnrichedRecentConnection,
  Profile,
  PublicProfile,
  RecentConnection,
  Session,
} from "./types";

export {
  activeRoomFor,
  activeRoomShellFor,
  createStateReadContext,
  enrichRoom,
  resolveActiveRoom,
} from "./room-read-model";
export type { StateReadContext } from "./room-read-model";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPart(length: number): string {
  return Array.from({ length }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
}

export function generateFriendCode(): string {
  return `NODE-${randomPart(4)}-${randomPart(4)}`;
}

export interface PublicMatchDirectoryEntry {
  ticketId: string;
  nickname: string;
  gameId: string;
  mode: string;
  rankCode: string | null;
  desiredRoles: number[];
  microphonePreference: string;
}

function maskPublicNickname(value: string | null | undefined): string {
  const text = String(value || "玩家").trim() || "玩家";
  const chars = Array.from(text);
  if (chars.length <= 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(Math.min(3, chars.length - 2))}${chars.at(-1)}`;
}

export async function publicMatchDirectory(limit = 6, options: { strict?: boolean } = {}): Promise<PublicMatchDirectoryEntry[]> {
  const safeLimit = Math.max(1, Math.min(18, Number(limit) || 6));
  const { data: rows, error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    // The opaque ticket id is the only handle exposed to the client so a
    // public card can be joined without leaking the player's user id.
    .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference")
    // Only players still looking for teammates are actionable. Candidates
    // already reserved for confirmation must not appear as join targets.
    .eq("state", "searching")
    .order("search_started_at", { ascending: true })
    .limit(safeLimit);
  if (error) {
    if (options.strict) throw error;
    return [];
  }
  if (!rows?.length) return [];
  const profiles = await publicProfilesFor(rows.map((row) => row.user_id), { onlineOnly: true });
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows
    .filter((row) => profileById.has(row.user_id))
    .map((row) => ({
      ticketId: row.id,
      nickname: maskPublicNickname(profileById.get(row.user_id)?.nickname),
      gameId: row.game_id || "deadlock",
      mode: row.mode || "ranked",
      rankCode: row.rank_code || null,
      desiredRoles: Array.isArray(row.desired_roles) ? row.desired_roles : [],
      microphonePreference: row.microphone_preference || "any",
    }));
}

export type PoolSummary = {
  online: number;
  matching: number;
  users: number;
  playing: number;
};

type PoolSummaryOptions = {
  strict?: boolean;
  signal?: AbortSignal;
  cache?: boolean;
};


const POOL_SUMMARY_CACHE_MS = 7_500;
let poolSummaryCache: { value: PoolSummary; expiresAt: number } | null = null;
let poolSummaryInflight: Promise<PoolSummary> | null = null;

export function clearPoolSummaryCache() {
  poolSummaryCache = null;
  poolSummaryInflight = null;
}

async function loadPoolSummary(options: PoolSummaryOptions): Promise<PoolSummary> {
  const { strict = false, signal } = options;
  const [matchingResult, onlineResult, usersResult, playingResult] = await Promise.all([
    (signal
      ? supabaseAdmin().from("matchmaking_tickets").select("id", { count: "exact", head: true }).abortSignal(signal)
      : supabaseAdmin().from("matchmaking_tickets").select("id", { count: "exact", head: true }))
      .in("state", ["searching", "candidate_found", "waiting_confirmation"]),
    (signal
      ? supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).abortSignal(signal)
      : supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }))
      .eq("online", true).gt("last_seen", presenceCutoffIso()),
    signal
      ? supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).abortSignal(signal)
      : supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }),
    signal
      ? supabaseAdmin().from("sessions").select("room_id").eq("status", "playing").abortSignal(signal)
      : supabaseAdmin().from("sessions").select("room_id").eq("status", "playing"),
  ]);
  if (strict) {
    const failed = [matchingResult, onlineResult, usersResult, playingResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
  const roomIds = Array.from(new Set((playingResult.data || []).map((session) => session.room_id).filter(Boolean)));
  const activeMembersResult = roomIds.length
    ? (signal
      ? await supabaseAdmin().from("room_members").select("id", { count: "exact", head: true }).eq("status", "active").in("room_id", roomIds).abortSignal(signal)
      : await supabaseAdmin().from("room_members").select("id", { count: "exact", head: true }).eq("status", "active").in("room_id", roomIds))
    : { count: 0, error: null };
  if (strict && activeMembersResult.error) throw activeMembersResult.error;
  return {
    online: onlineResult.count ?? 0,
    matching: matchingResult.count ?? 0,
    users: usersResult.count ?? 0,
    playing: activeMembersResult.count ?? 0,
  };
}

export async function poolSummary(options: PoolSummaryOptions = {}): Promise<PoolSummary> {
  const useCache = options.cache !== false && !options.signal;
  if (useCache && poolSummaryCache && poolSummaryCache.expiresAt > Date.now()) return poolSummaryCache.value;
  if (useCache && poolSummaryInflight) return poolSummaryInflight;

  const request = loadPoolSummary(options);
  if (!useCache) return request;
  poolSummaryInflight = request
    .then((value) => {
      poolSummaryCache = { value, expiresAt: Date.now() + POOL_SUMMARY_CACHE_MS };
      return value;
    })
    .finally(() => {
      poolSummaryInflight = null;
    });
  return poolSummaryInflight;
}

export async function poolCounts(options: { strict?: boolean } = {}): Promise<PoolSummary & { directory: PublicMatchDirectoryEntry[] }> {
  const [summary, directory] = await Promise.all([
    poolSummary(options),
    // The Hero shows six cards at a time and rotates through this larger,
    // privacy-safe window so the same first few players do not stay pinned.
    publicMatchDirectory(18 /* privacy-safe directory window */, options),
  ]);
  return { ...summary, directory };
}

const PUBLIC_DIRECTORY_CACHE_MS = 7_500;
let publicDirectoryCache: { value: PublicMatchDirectoryEntry[]; expiresAt: number } | null = null;
let publicDirectoryInflight: Promise<PublicMatchDirectoryEntry[]> | null = null;

export function clearPublicDirectoryCache() {
  publicDirectoryCache = null;
  publicDirectoryInflight = null;
}

export async function publicDirectory(): Promise<PublicMatchDirectoryEntry[]> {
  if (publicDirectoryCache && publicDirectoryCache.expiresAt > Date.now()) return publicDirectoryCache.value;
  if (publicDirectoryInflight) return publicDirectoryInflight;
  publicDirectoryInflight = publicMatchDirectory(18)
    .then((value) => {
      publicDirectoryCache = { value, expiresAt: Date.now() + PUBLIC_DIRECTORY_CACHE_MS };
      return value;
    })
    .finally(() => {
      publicDirectoryInflight = null;
    });
  return publicDirectoryInflight;
}


export async function recentConnectionsFor(profileId: string, context?: ReadContext): Promise<EnrichedRecentConnection[]> {
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
  const profiles = await publicProfilesFor(Array.from(grouped.keys()), {}, context);
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

export async function activeSessionFor(profileId: string, context?: StateReadContext): Promise<Session | null> {
  const candidate = await resolveActiveRoom(profileId, context);
  if (!candidate.session || !["ready", "playing"].includes(String(candidate.session.status))) return null;
  return candidate.session as Session;
}

/**
 * Restore the latest completed Session without exposing a session-level like.
 * Per-member likes are intentionally hydrated from the new directed table so
 * each teammate card can render its own state after refresh or re-entry.
 */
export async function completedSessionViewFor(profileId: string, context?: ReadContext): Promise<Record<string, unknown> | null> {
  const admin = supabaseAdmin();
  const { data: session } = await admin
    .from("sessions")
    .select("*")
    .eq("status", "completed")
    // `players` is jsonb. postgrest-js serializes a JavaScript array as the
    // PostgreSQL array literal `cs.{...}`, which is invalid JSON for jsonb.
    // Passing serialized JSON produces the required `cs.["..."]` filter.
    .contains("players", JSON.stringify([profileId]))
    .order("ended_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  const [{ data: room }, { data: likes }, { data: response }] = await Promise.all([
    session.room_id
      ? admin.from("rooms").select("*").eq("id", session.room_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("session_member_likes")
      .select("to_user_id")
      .eq("session_id", session.id)
      .eq("from_user_id", profileId),
    admin
      .from("session_responses")
      .select("rating,want_again")
      .eq("session_id", session.id)
      .eq("user_id", profileId)
      .maybeSingle(),
  ]);

  const enriched = room ? await enrichRoom(room as Record<string, unknown>, { context, resumeEligible: false }) : null;
  const fallbackProfiles = !enriched
    ? await publicProfilesFor(Array.isArray(session.players) ? session.players : [], {}, context)
    : [];
  const sourceMembers = enriched?.members?.length
    ? enriched.members
    : fallbackProfiles.map((member) => ({ ...member, memberStatus: "active", exitedAt: null }));
  const likedIds = new Set((likes || []).map((like) => like.to_user_id));
  const members = sourceMembers.map((member) => ({
    ...member,
    likedByMe: member.id !== profileId && likedIds.has(member.id),
  }));
  const activeMembers = members.filter((member) => (member.memberStatus || "active") === "active");

  return {
    ...mapSession(session as Session),
    members,
    activeMembers,
    otherMembers: members.filter((member) => member.id !== profileId),
    currentMemberCount: members.length,
    activeMemberCount: activeMembers.length,
    targetTotalPlayers: enriched?.targetTotalPlayers || members.length || session.players?.length || 1,
    goodbyeRequests: enriched?.goodbyeRequests || [],
    sessionSettlements: enriched?.sessionSettlements || [],
    rating: response?.rating || null,
    wantAgain: response?.want_again ?? null,
  };
}

export async function friendsFor(profileId: string, context?: ReadContext): Promise<PublicProfile[]> {
  const { data } = await supabaseAdmin()
    .from("friendships")
    .select("friend_id")
    .eq("user_id", profileId)
    .eq("status", "accepted");
  return publicProfilesFor((data || []).map((f) => f.friend_id), {}, context);
}

export async function profileWithGames(profile: Profile, context?: ReadContext): Promise<PublicProfile> {
  const games = await gamesForProfile(profile.id, context);
  return publicProfile(profile, games, { includePrivate: true });
}
