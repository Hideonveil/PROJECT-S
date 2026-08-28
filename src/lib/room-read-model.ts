import { createReadContext, publicProfilesFor, type ReadContext } from "./data";
import { roomMemberNeed, roomRecruitmentPresentation, roomShellNeed } from "./room-presentation";
import { mapGoodbyeRequests } from "./session-goodbye";
import { supabaseAdmin } from "./supabase";
import type { PublicProfile, Room } from "./types";

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
      need: roomMemberNeed(ticketByUser.get(m.user_id), roomNeed, rows.length),
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
  const [{ data: settlementRows }, { data: recruitmentVoteRows }] = await Promise.all([
    session?.id
      ? supabaseAdmin()
          .from("session_participant_settlements")
          .select("user_id,settlement_kind,settled_at")
          .eq("session_id", session.id)
          .order("settled_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabaseAdmin()
      .from("room_recruitment_votes")
      .select("user_id,requested_at,membership_version")
      .eq("room_id", room.id as string)
      .order("requested_at", { ascending: true }),
  ]);
  const recruitment = roomRecruitmentPresentation(room.status, session?.status, room.formation_state);
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
    recruiting: recruitment.recruiting,
    recruitmentState: recruitment.recruitmentState,
    formationState: (room.formation_state as Room["formationState"]) || (formationGroup ? "formal" : null),
    formationGroupId: formationGroup?.id || null,
    isForming: recruitment.isForming,
    resumeEligible: options.resumeEligible === true,
    goodbyeRequests: mapGoodbyeRequests(goodbyeRows || []),
    sessionSettlements: (settlementRows || []).map((row) => ({ userId: row.user_id, kind: row.settlement_kind, settledAt: row.settled_at })),
    recruitmentVotes: (recruitmentVoteRows || []).map((row) => ({ userId: row.user_id, requestedAt: row.requested_at })),
    recruitmentVoteCount: (recruitmentVoteRows || []).filter((row) => Number(row.membership_version) === Number(room.room_membership_version || 1)).length,
    recruitmentVoteTotal: memberViews.filter((member) => member.memberStatus === "active").length,
    roomMembershipVersion: Number(room.room_membership_version || 1),
    currentMemberCount: memberViews.filter((member) => member.memberStatus === "active").length,
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
  const ticketNeed = roomShellNeed(ticket, roomNeed);
  const roomStatus = String(room.status || "").toLowerCase();
  const formationState = (room.formation_state as Room["formationState"]) || null;
  const recruitment = roomRecruitmentPresentation(room.status, candidate.session?.status, formationState);
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
    recruiting: recruitment.recruiting,
    recruitmentState: recruitment.recruitmentState,
    formationState,
    formationGroupId: null,
    isForming: recruitment.isForming,
    shell: true,
    resumeEligible: true,
    goodbyeRequests: [],
    sessionSettlements: [],
    recruitmentVotes: [],
    recruitmentVoteCount: 0,
    recruitmentVoteTotal: 1,
    roomMembershipVersion: Number(room.room_membership_version || 1),
    currentMemberCount: activeCount,
    activeMemberCount: activeCount,
    targetTotalPlayers: Number(ticketNeed.target) || (roomStatus === "connecting" ? 2 : 1),
  };
}

