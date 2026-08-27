import { supabaseAdmin } from "./supabase";
import { createReadContext, gamesForProfile, publicProfile, publicProfilesFor, type ReadContext } from "./data";
import { mapGoodbyeRequests } from "./session-goodbye";
import { mapSession } from "./session";
import { presenceCutoffIso } from "./presence";
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

export type StateReadContext = ReadContext & {
  activeRoomCandidate?: Promise<ActiveRoomCandidate>;
};

const TERMINAL_ROOM_STATUSES = new Set(["completed", "cancelled", "closed", "finished"]);
const TERMINAL_SESSION_STATUSES = new Set(["completed", "cancelled"]);

export function createStateReadContext(): StateReadContext {
  return {
    ...createReadContext(),
  };
}

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

export async function enrichRoom(room: Record<string, unknown>, options: { context?: ReadContext; session?: Record<string, any> | null; resumeEligible?: boolean } = {}): Promise<Room> {
  const roomNeed = (room.need as Record<string, any>) || {};
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("user_id,status,exited_at")
    .eq("room_id", room.id as string)
    .order("joined_at", { ascending: true });
  const rows = (members || []) as Array<{ user_id: string; status: string; exited_at: string | null }>;
  // A room stores the shared game shell, while rank/microphone/role live on
  // the matchmaking tickets that created the pair. Bring those per-player
  // preferences into the room response so the Session fit table does not
  // fall back to the generic "段位待定" label.
  let { data: pair } = await supabaseAdmin()
    .from("matchmaking_pairs")
    .select("ticket_a_id,ticket_b_id")
    .eq("room_id", room.id as string)
    .maybeSingle();
  // Older rooms can miss the room_id back-reference even though the pair is
  // linked to the Session. Resolve through the Session as a safe fallback so
  // one member never drops back to generic rank/role text.
  if (!pair) {
    const { data: sessionLink } = await supabaseAdmin()
      .from("sessions")
      .select("id")
      .eq("room_id", room.id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionLink?.id) {
      const { data: sessionPair } = await supabaseAdmin()
        .from("matchmaking_pairs")
        .select("ticket_a_id,ticket_b_id")
        .eq("session_id", sessionLink.id)
        .maybeSingle();
      pair = sessionPair;
    }
  }
  let ticketIds = [pair?.ticket_a_id, pair?.ticket_b_id].filter(Boolean) as string[];
  let formationGroup: Record<string, any> | null = null;
  // Casual rooms are group-backed and do not have a matchmaking_pairs row.
  // Resolve every group member's ticket so a restored Session can rebuild
  // every player's conditions instead of silently falling back to pair data.
  if (!ticketIds.length) {
    const { data: group } = await supabaseAdmin()
      .from("matchmaking_groups")
      .select("id,state,hard_max_players,recruitment_mode")
      .eq("room_id", room.id as string)
      .maybeSingle();
    formationGroup = group as Record<string, any> | null;
    if (group?.id) {
      const { data: groupMembers } = await supabaseAdmin()
        .from("matchmaking_group_members")
        .select("ticket_id")
        .eq("group_id", group.id)
        .order("joined_at", { ascending: true });
      ticketIds = (groupMembers || []).map((member) => member.ticket_id).filter(Boolean) as string[];
    }
  }
  if (!ticketIds.length) {
    const { data: roomTickets } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select("id")
      .eq("room_id", room.id as string)
      .order("created_at", { ascending: true });
    ticketIds = (roomTickets || []).map((ticket) => ticket.id).filter(Boolean) as string[];
  }
  const { data: ticketRows } = ticketIds.length
    ? await supabaseAdmin()
        .from("matchmaking_tickets")
        .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference,desired_teammates,min_teammates,metadata")
        .in("id", ticketIds)
    : { data: [] };
  const ticketByUser = new Map((ticketRows || []).map((ticket) => [ticket.user_id, ticket]));
  const roleNames: Record<string, string> = {
    "1": "主核", "2": "伪核", "3": "坦克", "4": "游走", "5": "辅助", "6": "功能",
  };
  const roleLabels = (roles: unknown) => {
    const values = Array.isArray(roles) ? roles : [];
    return values.length
      ? values.map((role) => roleNames[String(role)] || `${role}号位`).join(" / ")
      : "位置不限";
  };
  const needForTicket = (ticket: Record<string, any> | undefined) => {
    if (!ticket) return null;
    const roles = Array.isArray(ticket.desired_roles) ? ticket.desired_roles : [];
    const metadata = ticket.metadata && typeof ticket.metadata === "object" ? ticket.metadata : {};
    const ownRoles = Array.isArray(metadata.ownRoles) ? metadata.ownRoles : roles;
    const teammateRoles = Array.isArray(metadata.teammateRoles) ? metadata.teammateRoles : [];
    const microphone = ticket.microphone_preference || "any";
    return {
      game: ticket.game_id || roomNeed.game || "deadlock",
      mode: ticket.mode || roomNeed.mode || "ranked",
      goal: ticket.mode === "casual" ? "娱乐" : "冲分",
      target: Number(roomNeed.target) || rows.length || 2,
      current: rows.length || 1,
      desiredTeammates: ticket.desired_teammates ?? null,
      minTeammates: ticket.min_teammates ?? null,
      time: "现在",
      voice: microphone !== "off",
      details: {
        rank: ticket.rank_code || "",
        role: roleLabels(ownRoles),
        teammateRole: roleLabels(teammateRoles),
        voicePreference: microphone,
      },
    };
  };
  // enrichRoom is only called after server-side room membership checks, so
  // members may see each other's in-room game account exchange fields.
  const memberIds = rows.map((m) => m.user_id);
  const profiles = await publicProfilesFor(memberIds, { includeGameAccountsFor: memberIds }, options.context);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const memberViews = rows
    .filter((m) => byId.has(m.user_id))
    .map((m) => ({
      ...(byId.get(m.user_id) as PublicProfile),
      memberStatus: m.status || "active",
      exitedAt: m.exited_at || null,
      need: needForTicket(ticketByUser.get(m.user_id)),
    }));
  const session = options.session === undefined
    ? (await supabaseAdmin()
        .from("sessions")
        .select("id,status")
        .eq("room_id", room.id as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()).data
    : options.session;
  const { data: goodbyeRows } = session?.id
    ? await supabaseAdmin()
        .from("session_goodbye_requests")
        .select("user_id,requested_at")
        .eq("session_id", session.id)
        .order("requested_at", { ascending: true })
    : { data: [] };
  const roomStatus = String(room.status || "").toLowerCase();
  const sessionStatus = String(session?.status || "").toLowerCase();
  const legacyFormationState = String(room.formation_state || "").toLowerCase();
  const hasFormalSession = ["ready", "playing", "completed", "cancelled"].includes(sessionStatus);
  const recruitmentLocked = hasFormalSession || ["locked", "formal"].includes(legacyFormationState);
  const recruiting = roomStatus === "connecting" && !recruitmentLocked;
  return {
    id: room.id as string,
    code: room.code as string,
    need: (room.need as Record<string, unknown>) || {},
    status: room.status as string,
    realtimeVersion: Number(room.realtime_version || 0),
    started_at: (room.started_at as string | null) || null,
    startedAt: (room.started_at as string | null) || null,
    players: memberViews.filter((m) => m.memberStatus === "active"),
    members: memberViews,
    sessionId: session?.id || null,
    sessionStatus: session?.status || null,
    recruiting: recruiting,
    recruitmentState: recruiting ? "recruiting" : recruitmentLocked ? "locked" : null,
    formationState: (room.formation_state as Room["formationState"]) || (formationGroup ? "formal" : null),
    formationGroupId: formationGroup?.id || null,
    isForming: ["forming", "backfilling", "locked"].includes(String(room.formation_state || "")),
    resumeEligible: options.resumeEligible === true,
    goodbyeRequests: mapGoodbyeRequests(goodbyeRows || []),
    currentMemberCount: memberViews.length,
    activeMemberCount: memberViews.filter((member) => member.memberStatus === "active").length,
    targetTotalPlayers: Number(roomNeed.target) || memberViews.length || 1,
  };
}

type ActiveRoomCandidate = {
  room: Record<string, unknown> | null;
  session: Record<string, any> | null;
  ticket: Record<string, any> | null;
};

const LIVE_TICKET_STATES = ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"];
const LIVE_GROUP_STATES = ["searching", "partial_ready", "forming", "backfilling", "locked"];

async function loadActiveRoomCandidate(profileId: string): Promise<ActiveRoomCandidate> {
  const { data: members } = await supabaseAdmin()
    .from("room_members")
    .select("room_id,user_id")
    .eq("user_id", profileId)
    .eq("status", "active");
  const activeMemberUserId = profileId;
  const roomIds = Array.from(new Set((members || [])
    .filter((member) => member.user_id === activeMemberUserId)
    .map((member) => member.room_id)
    .filter(Boolean)));
  if (!roomIds.length) return { room: null, session: null, ticket: null };
  const { data: rooms } = await supabaseAdmin()
    .from("rooms")
    .select("*")
    .in("id", roomIds)
    .in("status", ["connecting", "ready", "playing"])
    .order("created_at", { ascending: false })
    .limit(Math.max(roomIds.length, 10));
  if (!rooms?.length) return { room: null, session: null, ticket: null };
  // A room row can remain `playing` after its Session has completed. Resolve
  // the newest Session per room before restoring it, otherwise a refresh can
  // reopen the previous room instead of returning the player to home.
  const candidateIds = rooms.map((room) => room.id as string);
  const [{ data: sessions }, { data: tickets }, { data: groups }] = await Promise.all([
    supabaseAdmin()
      .from("sessions")
      .select("*")
      .in("room_id", candidateIds)
      .order("created_at", { ascending: false }),
    supabaseAdmin()
      .from("matchmaking_tickets")
      .select("id,user_id,room_id,state,group_id,game_id,mode,rank_code,desired_roles,microphone_preference,desired_teammates,min_teammates,metadata")
      .eq("user_id", profileId)
      .in("state", LIVE_TICKET_STATES),
    supabaseAdmin()
      .from("matchmaking_groups")
      .select("id,room_id,state,session_id")
      .in("room_id", candidateIds)
      .in("state", LIVE_GROUP_STATES),
  ]);
  const latestSessionByRoom = new Map<string, Record<string, any>>();
  for (const row of sessions || []) {
    if (!latestSessionByRoom.has(row.room_id as string)) {
      latestSessionByRoom.set(row.room_id as string, row as Record<string, any>);
    }
  }
  const liveTickets = (tickets || []).filter((ticket) => ticket.user_id === activeMemberUserId);
  const liveTicketIds = new Set(liveTickets.map((ticket) => ticket.id));
  const liveTicketRoomIds = new Set(liveTickets.map((ticket) => ticket.room_id).filter((roomId) => candidateIds.includes(roomId)));
  const groupIds = (groups || []).map((group) => group.id).filter(Boolean);
  const { data: groupMembers } = groupIds.length
    ? await supabaseAdmin()
        .from("matchmaking_group_members")
        .select("group_id,ticket_id,user_id,decision")
        .in("group_id", groupIds)
        .eq("user_id", activeMemberUserId)
        .eq("decision", "accepted")
    : { data: [] };
  const acceptedGroupIds = new Set((groupMembers || [])
    .filter((member) => liveTicketIds.has(member.ticket_id))
    .map((member) => member.group_id));
  const liveFormationRoomIds = new Set((groups || [])
    .filter((group) => acceptedGroupIds.has(group.id))
    .map((group) => group.room_id)
    .filter((roomId) => candidateIds.includes(roomId)));
  const sessionPlayersIncludeUser = (session: Record<string, any> | undefined) =>
    Array.isArray(session?.players) && session.players.map(String).includes(String(activeMemberUserId));
  const room = rooms.find((candidate) => {
    const latest = latestSessionByRoom.get(candidate.id as string);
    const sessionStatus = String(latest?.status || "").toLowerCase();
    const terminalSession = Boolean(latest && TERMINAL_SESSION_STATUSES.has(sessionStatus));
    if (terminalSession || TERMINAL_ROOM_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
    if (latest) {
      return (sessionStatus === "ready" || sessionStatus === "playing") && sessionPlayersIncludeUser(latest);
    }
    const preSessionEligible = liveTicketRoomIds.has(candidate.id) || liveFormationRoomIds.has(candidate.id);
    return preSessionEligible;
  });
  return {
    room: (room as Record<string, unknown>) || null,
    session: room ? (latestSessionByRoom.get(room.id as string) || null) : null,
    ticket: room
      ? ((liveTickets.find((ticket) => ticket.room_id === room.id) || liveTickets[0]) as Record<string, any> || null)
      : null,
  };
}

export async function resolveActiveRoom(profileId: string, context?: StateReadContext): Promise<ActiveRoomCandidate> {
  if (!context) return loadActiveRoomCandidate(profileId);
  if (!context.activeRoomCandidate) context.activeRoomCandidate = loadActiveRoomCandidate(profileId);
  return context.activeRoomCandidate;
}

export async function activeRoomFor(profileId: string, context?: StateReadContext): Promise<Room | null> {
  const candidate = await resolveActiveRoom(profileId, context);
  if (!candidate.room) return null;
  return enrichRoom(candidate.room, { context, session: candidate.session, resumeEligible: true });
}

/**
 * Return only the data needed to paint the Room-first shell. The resolver is
 * still the authority here, so an active historical member or orphaned ticket
 * can never be promoted into a resumable Room just because this is a fast
 * path. Profiles, ticket conditions, group members and chat history are
 * deliberately left to the asynchronous state hydration that follows.
 */
export async function activeRoomShellFor(profileId: string, context?: StateReadContext): Promise<Room | null> {
  const candidate = await resolveActiveRoom(profileId, context);
  if (!candidate.room) return null;

  const room = candidate.room;
  const roomNeed = (room.need as Record<string, any>) || {};
  const ticket = candidate.ticket;
  const ticketNeed = ticket
    ? {
        ...roomNeed,
        game: ticket.game_id || roomNeed.game || "deadlock",
        mode: ticket.mode || roomNeed.mode || "ranked",
        goal: ticket.mode === "casual" ? "休闲" : "冲分",
        rankCode: ticket.rank_code || roomNeed.rankCode || null,
        details: {
          ...(roomNeed.details && typeof roomNeed.details === "object" ? roomNeed.details : {}),
          rank: ticket.rank_code || roomNeed.details?.rank || roomNeed.rankCode || "",
          voicePreference: ticket.microphone_preference || roomNeed.details?.voicePreference || "any",
        },
      }
    : roomNeed;
  const roomStatus = String(room.status || "").toLowerCase();
  const sessionStatus = String(candidate.session?.status || "").toLowerCase();
  const hasFormalSession = ["ready", "playing", "completed", "cancelled"].includes(sessionStatus);
  const formationState = (room.formation_state as Room["formationState"]) || null;
  const recruitmentLocked = hasFormalSession || ["locked", "formal"].includes(String(formationState || "").toLowerCase());
  const recruiting = roomStatus === "connecting" && !recruitmentLocked;
  const member = { id: profileId, memberStatus: "active", exitedAt: null } as unknown as Room["members"][number];
  const activeCount = 1;

  return {
    id: room.id as string,
    code: room.code as string,
    need: ticketNeed,
    status: room.status as string,
    realtimeVersion: Number(room.realtime_version || 0),
    started_at: (room.started_at as string | null) || null,
    startedAt: (room.started_at as string | null) || null,
    players: [member],
    members: [member],
    sessionId: candidate.session?.id || null,
    sessionStatus: candidate.session?.status || null,
    recruiting,
    recruitmentState: recruiting ? "recruiting" : recruitmentLocked ? "locked" : null,
    formationState,
    formationGroupId: null,
    isForming: ["forming", "backfilling", "locked"].includes(String(formationState || "").toLowerCase()),
    shell: true,
    resumeEligible: true,
    goodbyeRequests: [],
    currentMemberCount: activeCount,
    activeMemberCount: activeCount,
    targetTotalPlayers: Number(ticketNeed.target) || (roomStatus === "connecting" ? 2 : 1),
  };
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
    .contains("players", [profileId])
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
    otherMembers: activeMembers.filter((member) => member.id !== profileId),
    currentMemberCount: members.length,
    activeMemberCount: activeMembers.length,
    targetTotalPlayers: enriched?.targetTotalPlayers || members.length || session.players?.length || 1,
    goodbyeRequests: enriched?.goodbyeRequests || [],
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
