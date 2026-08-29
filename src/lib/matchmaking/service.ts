import { AppError } from "../http";
import { KeyedSerialQueue } from "../keyed-serial-queue";
import { supabaseAdmin } from "../supabase";
import { attemptCasualGroup } from "./casual";
import { joinPublicTicketOperation } from "./direct-join";
import { type MatchmakingTicketRow } from "./records";
import { attemptRankedMatch } from "./ranked";
import { startMatcherScheduler, wakeMatcherScheduler } from "./scheduler";
import { matchmakingStatus } from "./status";
import { activeTicketRow } from "./ticket-store";
import type { MatchmakingInput } from "./types";

export { forceOpsCasualAttach, forceOpsCasualLock, previewOpsCasualAttach } from "./casual";
export { forceOpsRankedMatch, previewOpsRankedMatch } from "./ranked";
export { matchmakingStatus } from "./status";

const matchmakingQueue = new KeyedSerialQueue();

export function startPersistentMatcher() {
  startMatcherScheduler((row, context) => withMatchmakingSerial(row.user_id, () => row.mode === "casual"
    ? attemptCasualGroup(row.user_id, context)
    : attemptRankedMatch(row.user_id, context)));
}

function withMatchmakingSerial<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return matchmakingQueue.run(userId, work);
}


async function startTicketInternal(userId: string, input: MatchmakingInput, requestId: string | null) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (error) throw error;
  // Starting a ticket is a Room-entry mutation, not a synchronous matching
  // request. The RPC has already created/resolved the waiting Room; return its
  // ticket envelope now and let the persistent matcher own candidate attempts
  // in the background.
  if (data?.reused) return startTicketSnapshot(data);
  if (data?.id) {
    const currentMetadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const { error: metadataError } = await admin
      .from("matchmaking_tickets")
      .update({
        metadata: {
          ...currentMetadata,
          ownRoles: input.ownRoles || [],
          teammateRoles: input.teammateRoles || [],
          preferredTotalPlayers: input.preferredTotalPlayers,
        },
        // Search tickets remain active until the player explicitly cancels
        // or leaves the site. This is deliberately not a lease.
        expires_at: "infinity",
      })
      .eq("id", data.id);
    if (metadataError) throw metadataError;
  }
  wakeMatcherScheduler("ticket-started");
  return startTicketSnapshot(data);
}

function startTicketSnapshot(data: MatchmakingTicketRow) {
  const { roomCode, reused, ...ticket } = data || {};
  return {
    ticket: { ...ticket, roomCode: roomCode || ticket.roomCode || null },
    pair: null,
    group: null,
    candidate: null,
  };
}

export function startTicket(userId: string, input: MatchmakingInput, requestId: string | null) {
  return withMatchmakingSerial(userId, () => startTicketInternal(userId, input, requestId));
}


export function joinPublicTicket(userId: string, targetTicketId: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => joinPublicTicketOperation(userId, targetTicketId, requestId));
}


async function cancelTicketInternal(userId: string, reason: string, requestId: string | null) {
  const active = await activeTicketRow(userId);
  if (active?.mode === "casual" && active.group_id) {
    const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_group", {
      p_user_id: userId,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error) throw error;
    await reconcileOrphanWaitingRooms(userId, requestId);
    wakeMatcherScheduler("ticket-cancelled");
    return data;
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_ticket", {
    p_user_id: userId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) throw error;
  await reconcileOrphanWaitingRooms(userId, requestId);
  wakeMatcherScheduler("ticket-cancelled");
  return data;
}

async function reconcileOrphanWaitingRooms(userId: string, requestId: string | null) {
  const { error } = await supabaseAdmin().rpc("reconcile_orphan_waiting_rooms", {
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) throw error;
}

export function cancelTicket(userId: string, reason: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => cancelTicketInternal(userId, reason, requestId));
}

/**
 * Leave a Room-first Room before a formal Session exists. The Room code is
 * checked against the user's current ticket/group backing so an old active
 * room_member row cannot be used to exit or mutate an unrelated Room.
 */
export async function exitPreSessionRoom(userId: string, roomId: string, requestId: string | null) {
  const admin = supabaseAdmin();
  const { data: activeMember, error: memberError } = await admin
    .from("room_members")
    .select("room_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw memberError;
  if (!activeMember) throw new AppError("ROOM_NOT_ACTIVE", "你已不在这个房间中", 409);

  const ticket = await activeTicketRow(userId);
  if (!ticket) throw new AppError("ROOM_NOT_RESUMABLE", "这个房间已经结束，请重新开始", 409);

  let backedRoomId = ticket.room_id || null;
  if (!backedRoomId && ticket.group_id) {
    const { data: group, error: groupError } = await admin
      .from("matchmaking_groups")
      .select("room_id")
      .eq("id", ticket.group_id)
      .maybeSingle();
    if (groupError) throw groupError;
    backedRoomId = group?.room_id || null;
  }
  if (backedRoomId !== roomId) throw new AppError("ROOM_NOT_ACTIVE", "这个房间已经结束，请重新开始", 409);

  return cancelTicket(userId, "pre_session_room_exit", requestId);
}

async function confirmPairInternal(userId: string, pairId: string, decision: string, requestId: string | null) {
  if (!pairId || !["accepted", "rejected"].includes(decision)) {
    throw new AppError("CONFIRMATION_INVALID", "确认操作无效", 422);
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_confirm_pair", {
    p_pair_id: pairId,
    p_user_id: userId,
    p_decision: decision,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (data?.state === "cancelled") await attemptRankedMatch(userId);
  return matchmakingStatus(userId);
}

export function confirmPair(userId: string, pairId: string, decision: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => confirmPairInternal(userId, pairId, decision, requestId));
}

async function startGroupInternal(userId: string, groupId: string, requestId: string | null) {
  if (!groupId) throw new AppError("GROUP_INVALID", "队伍信息无效", 422);
  const { data, error } = await supabaseAdmin().rpc("matchmaking_start_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) throw error;
  return matchmakingStatus(userId);
}

export function startGroup(userId: string, groupId: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => startGroupInternal(userId, groupId, requestId));
}

async function confirmGroupInternal(userId: string, groupId: string, decision: string, requestId: string | null) {
  if (!groupId || !["accepted", "rejected"].includes(decision)) {
    throw new AppError("CONFIRMATION_INVALID", "确认操作无效", 422);
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_confirm_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_decision: decision,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (data?.state === "partial_ready") await attemptCasualGroup(userId);
  return matchmakingStatus(userId);
}

export function confirmGroup(userId: string, groupId: string, decision: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => confirmGroupInternal(userId, groupId, decision, requestId));
}

export async function submitMatchFeedback(userId: string, body: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin().rpc("matchmaking_submit_feedback", {
    p_pair_id: String(body.pairId || ""),
    p_user_id: userId,
    p_did_play: body.didPlay === true,
    p_rating: body.rating || null,
    p_want_again: typeof body.wantAgain === "boolean" ? body.wantAgain : null,
    p_tags: Array.isArray(body.tags) ? body.tags : [],
    p_note: String(body.note || ""),
  });
  if (error) throw error;
  return data;
}
