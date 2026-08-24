import { supabaseAdmin } from "./supabase";
import { gamesForProfile, publicProfile, publicProfilesFor } from "./data";
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

export async function poolCounts(options: { strict?: boolean } = {}): Promise<{ online: number; matching: number; users: number; playing: number; directory: PublicMatchDirectoryEntry[] }> {
  // The old `.gt("expires_at", activeTicketCutoff)` filter was a TTL-based
  // cleanup boundary; explicit-exit mode intentionally does not use it.
  const [matchingResult, onlineResult, usersResult, playingResult, directory] = await Promise.all([
    supabaseAdmin().from("matchmaking_tickets").select("id", { count: "exact", head: true }).in("state", ["searching", "candidate_found", "waiting_confirmation"]),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true })
      .eq("online", true).gt("last_seen", presenceCutoffIso()),
    supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin().from("sessions").select("room_id").eq("status", "playing"),
    // The Hero shows six cards at a time and rotates through this larger,
    // privacy-safe window so the same first few players do not stay pinned.
     publicMatchDirectory(18 /* privacy-safe directory window */, options),
  ]);
  if (options.strict) {
    const failed = [matchingResult, onlineResult, usersResult, playingResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
  const { count: matching } = matchingResult;
  const { count: online } = onlineResult;
  const { count: users } = usersResult;
  const { data: playingSessions } = playingResult;
  // A room shell intentionally remains visible after one member exits so the
  // other member can see what happened. Only a genuinely playing Session is
  // therefore allowed to contribute to the live playing count.
  const roomIds = Array.from(new Set((playingSessions || []).map((session) => session.room_id).filter(Boolean)));
  const activeMembersResult = roomIds.length
    ? await supabaseAdmin().from("room_members").select("id", { count: "exact", head: true }).eq("status", "active").in("room_id", roomIds)
    : { count: 0 };
  if (options.strict && "error" in activeMembersResult && activeMembersResult.error) throw activeMembersResult.error;
  const { count: playing } = activeMembersResult;
  return { online: online ?? 0, matching: matching ?? 0, users: users ?? 0, playing: playing ?? 0, directory };
}

export async function enrichRoom(room: Record<string, unknown>): Promise<Room> {
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
  // Casual rooms are group-backed and do not have a matchmaking_pairs row.
  // Resolve every group member's ticket so a restored Session can rebuild
  // every player's conditions instead of silently falling back to pair data.
  if (!ticketIds.length) {
    const { data: group } = await supabaseAdmin()
      .from("matchmaking_groups")
      .select("id")
      .eq("room_id", room.id as string)
      .maybeSingle();
    if (group?.id) {
      const { data: groupMembers } = await supabaseAdmin()
        .from("matchmaking_group_members")
        .select("ticket_id")
        .eq("group_id", group.id)
        .order("joined_at", { ascending: true });
      ticketIds = (groupMembers || []).map((member) => member.ticket_id).filter(Boolean) as string[];
    }
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
  const profiles = await publicProfilesFor(memberIds, { includeGameAccountsFor: memberIds });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const memberViews = rows
    .filter((m) => byId.has(m.user_id))
    .map((m) => ({
      ...(byId.get(m.user_id) as PublicProfile),
      memberStatus: m.status || "active",
      exitedAt: m.exited_at || null,
      need: needForTicket(ticketByUser.get(m.user_id)),
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
    currentMemberCount: memberViews.length,
    activeMemberCount: memberViews.filter((member) => member.memberStatus === "active").length,
    targetTotalPlayers: Number(roomNeed.target) || memberViews.length || 1,
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
    .limit(Math.max(roomIds.length, 10));
  if (!rooms?.length) return null;
  // A room row can remain `playing` after its Session has completed. Resolve
  // the newest Session per room before restoring it, otherwise a refresh can
  // reopen the previous room instead of returning the player to home.
  const candidateIds = rooms.map((room) => room.id as string);
  const { data: sessions } = await supabaseAdmin()
    .from("sessions")
    .select("room_id,status,created_at")
    .in("room_id", candidateIds)
    .order("created_at", { ascending: false });
  const latestSessionByRoom = new Map<string, { status: string }>();
  for (const row of sessions || []) {
    if (!latestSessionByRoom.has(row.room_id as string)) {
      latestSessionByRoom.set(row.room_id as string, { status: row.status as string });
    }
  }
  const room = rooms.find((candidate) => {
    const latest = latestSessionByRoom.get(candidate.id as string);
    return !latest || ["ready", "playing"].includes(latest.status);
  });
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
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  const roomIds = (memberships || []).map((row) => row.room_id);
  if (!roomIds.length) return null;
  // Resolve the current live room first. Looking up sessions directly across
  // every historical membership can resurrect an older room when a completed
  // Session left its member rows active.
  const { data: rooms } = await supabaseAdmin()
    .from("rooms")
    .select("id")
    .in("id", roomIds)
    .in("status", ["connecting", "ready", "playing"])
    .order("created_at", { ascending: false })
    .limit(1);
  const roomId = rooms?.[0]?.id;
  if (!roomId) return null;
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("room_id", roomId)
    .in("status", ["ready", "playing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Session) || null;
}

/**
 * Restore the latest completed Session without exposing a session-level like.
 * Per-member likes are intentionally hydrated from the new directed table so
 * each teammate card can render its own state after refresh or re-entry.
 */
export async function completedSessionViewFor(profileId: string): Promise<Record<string, unknown> | null> {
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

  const enriched = room ? await enrichRoom(room as Record<string, unknown>) : null;
  const fallbackProfiles = !enriched
    ? await publicProfilesFor(Array.isArray(session.players) ? session.players : [])
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
