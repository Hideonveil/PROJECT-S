const TERMINAL_ROOMS = new Set(["completed", "cancelled", "closed", "finished"]);
const TERMINAL_SESSIONS = new Set(["completed", "cancelled"]);

import { supabaseAdmin } from "../supabase";

export type ResumeInput = {
  roomStatus: string | null;
  activeMember: boolean;
  ticketLive: boolean;
  groupLive: boolean;
  sessionStatus: string | null;
  belongsToSession: boolean;
};

export function resumeState(input: ResumeInput): "RECOVERABLE" | "NOT_RECOVERABLE" {
  if (!input.activeMember || !input.roomStatus || TERMINAL_ROOMS.has(input.roomStatus)) return "NOT_RECOVERABLE";
  if (input.sessionStatus) return input.belongsToSession && !TERMINAL_SESSIONS.has(input.sessionStatus) ? "RECOVERABLE" : "NOT_RECOVERABLE";
  return input.ticketLive || input.groupLive ? "RECOVERABLE" : "NOT_RECOVERABLE";
}

export function classifyRoomAnomalies(input: { status: string | null; activeMembers: number; hasLiveTicket: boolean; hasLiveSession: boolean }): string[] {
  const flags: string[] = [];
  if (input.status && TERMINAL_ROOMS.has(input.status) && input.activeMembers > 0) flags.push("TERMINAL_ROOM_ACTIVE_MEMBER");
  if (!input.status) flags.push("ROOM_STATUS_MISSING");
  if (input.activeMembers === 0 && (input.hasLiveTicket || input.hasLiveSession)) flags.push("ORPHAN_LIFECYCLE_ENTITY");
  return flags;
}

export function isSyntheticProfile(profile: Record<string, unknown>): boolean {
  return profile.account_type === "synthetic_test" || profile.purpose === "capacity" || profile.test_purpose === "capacity";
}

export type LiveOpsSnapshot = {
  generatedAt: string;
  onlineNow: number;
  matchingNow: number;
  ranked: number;
  casual: number;
  waitingRooms: number;
  playing: number;
  rankedWaits: Record<string, number>;
  casualFormation: Record<string, number>;
  recentEvents: Array<{ occurredAt: string; type: string; actorUserId: string | null; reason: string | null }>;
};

export async function resolveLiveOpsSnapshot(): Promise<LiveOpsSnapshot> {
  const admin = supabaseAdmin();
  const now = Date.now();
  const minuteAgo = new Date(now - 5 * 60_000).toISOString();
  const [online, searching, ranked, casual, waitingRooms, playing, rankedRows, casualGroups, events] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("online", true),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching"),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("mode", "ranked"),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("mode", "casual"),
    admin.from("rooms").select("id", { count: "exact", head: true }).in("status", ["connecting", "ready"]),
    admin.from("sessions").select("id", { count: "exact", head: true }).in("status", ["ready", "playing", "active"]),
    admin.from("matchmaking_tickets").select("search_started_at").eq("state", "searching").eq("mode", "ranked"),
    admin.from("matchmaking_groups").select("state").in("state", ["forming", "backfilling", "locked"]),
    admin.from("matchmaking_state_events").select("occurred_at,to_state,actor_user_id,reason").gte("occurred_at", minuteAgo).order("occurred_at", { ascending: false }).limit(30),
  ]);
  const results = [online, searching, ranked, casual, waitingRooms, playing, rankedRows, casualGroups, events];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  const rankedWaits = { under30: 0, between30And60: 0, over60: 0, over120: 0 };
  for (const row of rankedRows.data || []) {
    const age = now - new Date(row.search_started_at).getTime();
    if (age < 30_000) rankedWaits.under30 += 1;
    else if (age < 60_000) rankedWaits.between30And60 += 1;
    else { rankedWaits.over60 += 1; if (age >= 120_000) rankedWaits.over120 += 1; }
  }
  const casualFormation = { forming: 0, backfilling: 0, locked: 0 };
  for (const row of casualGroups.data || []) {
    if (row.state in casualFormation) casualFormation[row.state as keyof typeof casualFormation] += 1;
  }
  return {
    generatedAt: new Date(now).toISOString(),
    onlineNow: Number(online.count || 0), matchingNow: Number(searching.count || 0), ranked: Number(ranked.count || 0), casual: Number(casual.count || 0), waitingRooms: Number(waitingRooms.count || 0), playing: Number(playing.count || 0),
    rankedWaits, casualFormation,
    recentEvents: (events.data || []).map((event) => ({ occurredAt: event.occurred_at, type: event.to_state, actorUserId: event.actor_user_id, reason: event.reason })),
  };
}

export async function resolveUserLifecycle(userId: string) {
  const admin = supabaseAdmin();
  const [{ data: profile, error: profileError }, { data: ticket, error: ticketError }, { data: memberships, error: membershipError }] = await Promise.all([
    admin.from("profiles").select("id,username,nickname,online,last_seen,created_at").eq("id", userId).maybeSingle(),
    admin.from("matchmaking_tickets").select("id,mode,rank_code,microphone_preference,state,group_id,pair_id,room_id,search_started_at,updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("room_members").select("room_id,status,joined_at,exited_at").eq("user_id", userId).order("joined_at", { ascending: false }).limit(1),
  ]);
  if (profileError || ticketError || membershipError) throw profileError || ticketError || membershipError;
  if (!profile) return null;
  const membership = memberships?.[0] || null;
  const [{ data: room, error: roomError }, { data: session, error: sessionError }, { data: pair, error: pairError }, { data: group, error: groupError }] = await Promise.all([
    membership ? admin.from("rooms").select("id,code,status,formation_state,created_at").eq("id", membership.room_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    membership ? admin.from("sessions").select("id,status,created_at").eq("room_id", membership.room_id).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ticket?.pair_id ? admin.from("matchmaking_pairs").select("id,state,room_id,session_id").eq("id", ticket.pair_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ticket?.group_id ? admin.from("matchmaking_groups").select("id,state,room_id,session_id,hard_max_players,recruitment_mode").eq("id", ticket.group_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (roomError || sessionError || pairError || groupError) throw roomError || sessionError || pairError || groupError;
  const state = resumeState({ roomStatus: room?.status || null, activeMember: membership?.status === "active", ticketLive: ticket?.state === "searching", groupLive: Boolean(group && ["forming", "backfilling", "searching", "partial_ready"].includes(group.state)), sessionStatus: session?.status || null, belongsToSession: Boolean(session) });
  return { profile, ticket: ticket || null, membership, pair: pair || null, group: group || null, room: room || null, session: session || null, resumeState: state };
}

export async function resolveRoomInspector() {
  const admin = supabaseAdmin();
  const { data: rooms, error } = await admin.from("rooms").select("id,code,status,formation_state,created_at").order("created_at", { ascending: false }).limit(250);
  if (error) throw error;
  const rows = await Promise.all((rooms || []).map(async (room) => {
    const [{ count: activeMembers, error: memberError }, { data: session, error: sessionError }, { data: group, error: groupError }, { count: tickets, error: ticketError }] = await Promise.all([
      admin.from("room_members").select("id", { count: "exact", head: true }).eq("room_id", room.id).eq("status", "active"),
      admin.from("sessions").select("id,status").eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("matchmaking_groups").select("id,state").eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("room_id", room.id).in("state", ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"]),
    ]);
    if (memberError || sessionError || groupError || ticketError) throw memberError || sessionError || groupError || ticketError;
    return { ...room, activeMembers: Number(activeMembers || 0), session: session || null, group: group || null, activeTickets: Number(tickets || 0), anomalyFlags: classifyRoomAnomalies({ status: room.status, activeMembers: Number(activeMembers || 0), hasLiveTicket: Number(tickets || 0) > 0, hasLiveSession: Boolean(session && !TERMINAL_SESSIONS.has(session.status)) }) };
  }));
  return rows;
}
