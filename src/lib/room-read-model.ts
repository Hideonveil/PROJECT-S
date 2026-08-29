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

type RoomProjection = {
  room: Record<string, any>;
  roomVersion: number;
  membershipVersion: number;
  members: Array<{ user_id: string; status: string; exited_at: string | null }>;
  session: Record<string, any> | null;
  pair: Record<string, any> | null;
  group: Record<string, any> | null;
  tickets: Array<Record<string, any>>;
  recruitmentVotes: Array<{ user_id: string; requested_at: string; membership_version: number }>;
  goodbyeRequests: Array<{ user_id: string; requested_at: string }>;
  settlements: Array<{ user_id: string; settlement_kind: string; settled_at: string }>;
};

export async function enrichRoom(room: Record<string, unknown>, options: { context?: ReadContext; session?: Record<string, any> | null; resumeEligible?: boolean } = {}): Promise<Room> {
  const { data, error } = await supabaseAdmin().rpc("read_room_projection", { p_room_id: room.id as string });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("ROOM_PROJECTION_NOT_FOUND");
  const projection = data as RoomProjection;
  const projectedRoom = projection.room;
  const roomNeed = (projectedRoom.need as Record<string, any>) || {};
  const rows = Array.isArray(projection.members) ? projection.members : [];
  const ticketRows = Array.isArray(projection.tickets) ? projection.tickets : [];
  const ticketByUser = new Map(ticketRows.map((ticket) => [ticket.user_id, ticket]));
  const formationGroup = projection.group;
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
  const session = projection.session;
  const goodbyeRows = Array.isArray(projection.goodbyeRequests) ? projection.goodbyeRequests : [];
  const settlementRows = Array.isArray(projection.settlements) ? projection.settlements : [];
  const recruitmentVoteRows = Array.isArray(projection.recruitmentVotes) ? projection.recruitmentVotes : [];
  const recruitment = roomRecruitmentPresentation(projectedRoom.status, session?.status, projectedRoom.formation_state);
  return {
    id: projectedRoom.id as string,
    code: projectedRoom.code as string,
    need: roomNeed,
    status: projectedRoom.status as string,
    realtimeVersion: Number(projection.roomVersion ?? projectedRoom.realtime_version ?? 0),
    started_at: (projectedRoom.started_at as string | null) || null,
    startedAt: (projectedRoom.started_at as string | null) || null,
    players: memberViews.filter((m) => m.memberStatus === "active"),
    members: memberViews,
    sessionId: session?.id || null,
    sessionStatus: session?.status || null,
    recruiting: recruitment.recruiting,
    recruitmentState: recruitment.recruitmentState,
    formationState: (projectedRoom.formation_state as Room["formationState"]) || (formationGroup ? "formal" : null),
    formationGroupId: formationGroup?.id || null,
    isForming: recruitment.isForming,
    resumeEligible: options.resumeEligible === true,
    goodbyeRequests: mapGoodbyeRequests(goodbyeRows),
    sessionSettlements: settlementRows.map((row) => ({ userId: row.user_id, kind: row.settlement_kind, settledAt: row.settled_at })),
    recruitmentVotes: recruitmentVoteRows.map((row) => ({ userId: row.user_id, requestedAt: row.requested_at })),
    recruitmentVoteCount: recruitmentVoteRows.filter((row) => Number(row.membership_version) === Number(projection.membershipVersion || 1)).length,
    recruitmentVoteTotal: memberViews.filter((member) => member.memberStatus === "active").length,
    roomMembershipVersion: Number(projection.membershipVersion || 1),
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
