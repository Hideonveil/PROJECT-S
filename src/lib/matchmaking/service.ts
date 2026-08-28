import { publicProfilesFor } from "../data";
import { AppError } from "../http";
import { KeyedSerialQueue } from "../keyed-serial-queue";
import { supabaseAdmin } from "../supabase";
import type { MatcherAttemptContext } from "./attempt-context";
import { autoConnectPair } from "./pair-lifecycle";
import {
  groupFromRow,
  rulesFromRow,
  ticketFromRow,
  type MatchmakingGroupRow,
  type MatchmakingRuleSetRow,
  type MatchmakingTicketRow,
} from "./records";
import {
  CASUAL_BACKFILL_BUDGET,
  RESERVATION_CONFLICT_BUDGET,
  isGroupReservationConflict,
  isPairReservationConflict,
  recordReservationAttempt,
  recordReservationConflict,
} from "./reservations";
import { evaluateCompatibility, rankCandidates } from "./rules";
import {
  increment as incrementRuntimeMetric,
  observeLatency,
} from "./runtime-telemetry";
import { attemptRankedMatch } from "./ranked";
import { startMatcherScheduler } from "./scheduler";
import { activeTicketRow } from "./ticket-store";
import type { MatchmakingInput } from "./types";

export { forceOpsRankedMatch, previewOpsRankedMatch } from "./ranked";

const matchmakingQueue = new KeyedSerialQueue();

export function startPersistentMatcher() {
  startMatcherScheduler((row, context) => withMatchmakingSerial(row.user_id, () => row.mode === "casual"
    ? attemptCasualGroup(row.user_id, context)
    : attemptRankedMatch(row.user_id, context)));
}

function withMatchmakingSerial<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return matchmakingQueue.run(userId, work);
}

export async function previewOpsCasualAttach(userId: string, groupId: string) {
  const admin = supabaseAdmin();
  const [ticket, groupResult] = await Promise.all([
    activeTicketRow(userId),
    admin.from("matchmaking_groups").select("*").eq("id", groupId).maybeSingle(),
  ]);
  if (groupResult.error) throw groupResult.error;
  const group = groupResult.data as MatchmakingGroupRow | null;
  if (!ticket || ticket.mode !== "casual" || ticket.state !== "searching" || !group || !["forming", "backfilling", "searching", "partial_ready"].includes(group.state)) {
    throw new AppError("OPS_CASUAL_ATTACH_UNAVAILABLE", "玩家或休闲 Room 已不在可招募状态", 409, true);
  }
  const { count, error: countError } = await admin.from("matchmaking_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).neq("decision", "rejected");
  if (countError) throw countError;
  if (Number(count || 0) >= Number(group.hard_max_players || 6)) throw new AppError("GROUP_FULL", "休闲 Room 已满员", 409, false);
  const { data: ownerTicket, error: ownerError } = await admin.from("matchmaking_tickets").select("*").eq("group_id", groupId).eq("user_id", group.owner_user_id).maybeSingle();
  if (ownerError || !ownerTicket) throw ownerError || new AppError("OPS_CASUAL_OWNER_TICKET_MISSING", "休闲 Room 缺少有效 Owner Ticket", 409, true);
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", ownerTicket.rule_set_id).maybeSingle();
  if (ruleError || !ruleRow) throw ruleError || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  return {
    ticket,
    group,
    compatibility: evaluateCompatibility(
      ticketFromRow(ownerTicket),
      ticketFromRow(ticket),
      rulesFromRow(ruleRow as MatchmakingRuleSetRow),
    ),
    rules: rulesFromRow(ruleRow as MatchmakingRuleSetRow),
  };
}

export async function forceOpsCasualAttach(userId: string, groupId: string, reason: string) {
  const preview = await previewOpsCasualAttach(userId, groupId);
  if (!preview.compatibility.compatible) throw new AppError("OPS_CASUAL_ATTACH_INCOMPATIBLE", "玩家不满足当前休闲 Room 的匹配规则", 409, false);
  const { data, error } = await supabaseAdmin().rpc("matchmaking_reserve_group_member", {
    p_group_id: groupId,
    p_ticket_id: preview.ticket.id,
    p_hard_snapshot: { passed: true, source: "ops_v2", reason: reason.slice(0, 200), ruleSetVersion: preview.rules.version },
    p_soft_snapshot: { ...preview.compatibility.softSignals, source: "ops_v2" },
  });
  if (isGroupReservationConflict(error, data)) throw new AppError("GROUP_RESERVATION_CONFLICT", "休闲 Room 刚刚发生变化，请刷新后重试", 409, true);
  if (error) throw error;
  return { groupId, roomId: data?.room_id || preview.group.room_id || null, status: "attached" };
}

export async function forceOpsCasualLock(groupId: string, reason: string, requestId: string) {
  const admin = supabaseAdmin();
  const { data: group, error: groupError } = await admin
    .from("matchmaking_groups")
    .select("id,owner_user_id,state,room_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError || !group) throw groupError || new AppError("OPS_CASUAL_LOCK_UNAVAILABLE", "休闲 Room 已不存在", 409, true);
  if (!["forming", "backfilling", "searching", "partial_ready"].includes(String(group.state))) {
    throw new AppError("OPS_CASUAL_LOCK_UNAVAILABLE", "休闲 Room 已不在可停止招募状态", 409, true);
  }
  const { data, error } = await admin.rpc("matchmaking_lock_forming_group", {
    p_group_id: groupId,
    p_user_id: group.owner_user_id,
    p_request_id: `ops-v2:${requestId}:${reason.slice(0, 64)}`,
  });
  if (error) throw error;
  return { groupId, roomId: data?.room_id || group.room_id || null, status: "locked" };
}

async function groupSnapshot(groupId: string, viewerId: string) {
  const admin = supabaseAdmin();
  const { data: groupRow, error: groupError } = await admin.from("matchmaking_groups").select("*").eq("id", groupId).maybeSingle();
  if (groupError) throw groupError;
  if (!groupRow) return null;
  const { data: memberRows, error: memberError } = await admin
    .from("matchmaking_group_members")
    .select("group_id,ticket_id,user_id,is_owner,decision,joined_at,responded_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (memberError) throw memberError;
  const members = (memberRows || []) as Array<Record<string, any>>;
  const ticketIds = members.map((member) => member.ticket_id).filter(Boolean);
  const { data: memberTickets, error: ticketError } = ticketIds.length
    ? await admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").in("id", ticketIds)
    : { data: [], error: null };
  if (ticketError) throw ticketError;
  const ticketById = new Map((memberTickets || []).map((ticket) => [ticket.id, ticket]));
  const profiles = await publicProfilesFor(members.map((member) => member.user_id));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const group = groupFromRow(groupRow as MatchmakingGroupRow, members.map((member) => ({
    userId: member.user_id,
    ticketId: member.ticket_id,
    isOwner: Boolean(member.is_owner),
    decision: member.decision || "pending",
    joinedAt: member.joined_at,
    respondedAt: member.responded_at || null,
    rankCode: ticketById.get(member.ticket_id)?.rank_code || null,
    microphonePreference: ticketById.get(member.ticket_id)?.microphone_preference || "any",
    mode: ticketById.get(member.ticket_id)?.mode || "casual",
    profile: profileById.get(member.user_id) || null,
  })));
  if (group.roomId) {
    const { data: room } = await admin.from("rooms").select("code,formation_state").eq("id", group.roomId).maybeSingle();
    group.roomCode = room?.code || null;
    group.roomPhase = room?.formation_state || null;
  }
  return group.members.some((member) => member.userId === viewerId) ? group : null;
}

async function attemptCasualGroup(userId: string, context?: MatcherAttemptContext) {
  const admin = supabaseAdmin();
  let sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.mode !== "casual") return sourceRow;
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", sourceRow.rule_set_id).single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");
  const rules = rulesFromRow(ruleRow as MatchmakingRuleSetRow);
  const source = ticketFromRow(sourceRow);

  // A non-owner already inside a forming room waits for the owner (or another
  // sweep) to backfill it. The owner remains searchable and drives the room.
  let ownGroup: MatchmakingGroupRow | null = null;
  if (sourceRow.group_id) {
    const { data: group } = await admin.from("matchmaking_groups").select("*").eq("id", sourceRow.group_id).maybeSingle();
    ownGroup = group as MatchmakingGroupRow | null;
    if (ownGroup && ownGroup.owner_user_id !== userId) {
      context?.markWaiting();
      return sourceRow;
    }
    if (ownGroup && !["searching", "partial_ready", "forming", "backfilling"].includes(ownGroup.state)) return sourceRow;
  }

  // A new starter first tries existing groups. This is the only operation that
  // changes the candidate's group; the RPC performs the row-lock boundary.
  if (!ownGroup && sourceRow.state === "searching") {
    const { data: openGroups, error: openGroupError } = await admin
      .from("matchmaking_groups")
      .select("*")
      .eq("game_id", source.gameId)
      .in("state", ["searching", "partial_ready", "forming", "backfilling"])
      .neq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(24);
    if (openGroupError) throw openGroupError;
    let conflictCount = 0;
    for (const groupRow of (openGroups || []) as MatchmakingGroupRow[]) {
      if (conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
      const { count } = await admin.from("matchmaking_group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupRow.id).neq("decision", "rejected");
      if (Number(count || 0) >= Number(groupRow.hard_max_players || 6)) {
        incrementRuntimeMetric("group_full");
        continue;
      }
      const { data: ownerRow } = await admin.from("matchmaking_tickets")
        .select("*").eq("group_id", groupRow.id)
        .eq("user_id", groupRow.owner_user_id).maybeSingle();
      if (!ownerRow) continue;
      const ownerTicket = ticketFromRow(ownerRow);
      const candidate = rankCandidates(ownerTicket, [source], rules)[0];
      if (!candidate) continue;
      recordReservationAttempt("group");
      const { data: reservation, error } = await admin.rpc("matchmaking_reserve_group_member", {
        p_group_id: groupRow.id,
        p_ticket_id: source.id,
        p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
        p_soft_snapshot: candidate.compatibility.softSignals,
      });
      if (!error && !isGroupReservationConflict(null, reservation)) {
        if (context) {
          context.markSuccess(source.id);
          observeLatency("time_to_forming_room", Date.now() - context.startedAt);
          observeLatency("time_to_first_match", Date.now() - context.startedAt);
        }
        incrementRuntimeMetric("group_success");
        return activeTicketRow(userId);
      }
      if (!isGroupReservationConflict(error, reservation)) throw error;
      conflictCount += 1;
      context?.recordBusinessConflict(String(reservation?.reason || "GROUP_RESERVATION_CONFLICT"), groupRow.id);
      recordReservationConflict("group");
    }

    if (conflictCount >= RESERVATION_CONFLICT_BUDGET) return activeTicketRow(userId);

    if (!sourceRow.group_id) {
      const { error: groupError } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: source.id });
      if (groupError) throw groupError;
      sourceRow = await activeTicketRow(userId);
      if (!sourceRow?.group_id) return sourceRow;
      const { data: group } = await admin.from("matchmaking_groups").select("*").eq("id", sourceRow.group_id).maybeSingle();
      ownGroup = group as MatchmakingGroupRow | null;
    }
  }

  if (!ownGroup || ownGroup.owner_user_id !== userId || !["searching", "partial_ready", "forming", "backfilling"].includes(ownGroup.state)) {
    return activeTicketRow(userId);
  }

  const { data: candidates, error: candidatesError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("game_id", source.gameId)
    .eq("mode", "casual")
    .eq("state", "searching")
    .neq("user_id", userId)
    .order("search_started_at", { ascending: true })
    .limit(100);
  if (candidatesError) throw candidatesError;
  // Two one-person placeholder groups must not try to absorb each other in
  // opposite directions. A stable UUID order gives one owner the merge right;
  // tickets without a group remain eligible for ordinary backfill.
  const eligibleCandidates = (candidates || [])
    .map(ticketFromRow)
    .filter((candidate) => !candidate.groupId || String(ownGroup.id) < String(candidate.groupId));
  const ranked = rankCandidates(source, eligibleCandidates, rules);
  let conflictCount = 0;
  let accepted = 0;
  for (const candidate of ranked) {
    if (accepted >= CASUAL_BACKFILL_BUDGET || conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
    if (context?.targetId && context.targetId === candidate.ticket.id) {
      incrementRuntimeMetric("same_target_suppressed");
      continue;
    }
    recordReservationAttempt("group");
    incrementRuntimeMetric("backfill_attempts");
    const { data: reservation, error } = await admin.rpc("matchmaking_reserve_group_member", {
      p_group_id: ownGroup.id,
      p_ticket_id: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: candidate.compatibility.softSignals,
    });
    if (!error && !isGroupReservationConflict(null, reservation)) {
      accepted += 1;
      incrementRuntimeMetric("group_success");
      incrementRuntimeMetric("backfill_success");
      if (context) {
        context.markSuccess(candidate.ticket.id);
        observeLatency("backfill_latency", Date.now() - context.startedAt);
      }
      if (["matched", "playing"].includes(reservation?.state)) break;
      continue;
    }
    if (!isGroupReservationConflict(error, reservation)) throw error;
    conflictCount += 1;
    context?.recordBusinessConflict(String(reservation?.reason || "GROUP_RESERVATION_CONFLICT"), candidate.ticket.id);
    recordReservationConflict("group");
  }
  return activeTicketRow(userId);
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

/**
 * Join one of the privacy-safe public matchmaking entries directly. The
 * target ticket is revalidated and reserved atomically by the existing pair /
 * group RPCs, so a stale card cannot create a ghost ticket or bypass the
 * normal hard compatibility rules.
 */
async function joinPublicTicketInternal(userId: string, targetTicketId: string, requestId: string | null) {
  const admin = supabaseAdmin();
  const active = await activeTicketRow(userId);
  if (active) {
    // A retried request with the same idempotency key may arrive after the
    // first reservation committed. Return the live snapshot instead of
    // manufacturing another ticket; a different request remains a conflict.
    if (requestId && active.request_id === requestId) return matchmakingStatus(userId);
    throw new AppError("MATCH_ALREADY_ACTIVE", "你已经在匹配中，请先退出当前匹配", 409);
  }

  const { data: targetRow, error: targetError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("id", targetTicketId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow || targetRow.user_id === userId
      || targetRow.state !== "searching") {
    throw new AppError("DIRECT_JOIN_UNAVAILABLE", "这位玩家刚刚离开匹配，请重新选择", 409, true);
  }

  const { data: ruleRow, error: ruleError } = await admin
    .from("matchmaking_rule_sets")
    .select("*")
    .eq("id", targetRow.rule_set_id)
    .single();
  if (ruleError || !ruleRow) throw ruleError || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  const rules = rulesFromRow(ruleRow as MatchmakingRuleSetRow);
  const target = ticketFromRow(targetRow);
  const input: MatchmakingInput = {
    gameId: target.gameId,
    mode: target.mode,
    rankCode: target.rankCode,
    desiredRoles: target.desiredRoles,
    ownRoles: [],
    teammateRoles: [],
    microphonePreference: target.microphonePreference,
    desiredTeammates: target.mode === "casual" ? target.desiredTeammates : undefined,
    minTeammates: target.mode === "casual" ? target.minTeammates : undefined,
  };
  const { data: createdTicket, error: createError } = await admin.rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (createError) throw createError;
  // The starter RPC reuses an existing ticket under a race. Never attach that
  // unrelated ticket to a public target; surface the same active-match guard.
  if (createdTicket?.reused) {
    throw new AppError("MATCH_ALREADY_ACTIVE", "你已经在匹配中，请先退出当前匹配", 409);
  }
  const joiner = ticketFromRow(createdTicket || {});
  if (!joiner.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
  const { error: joinerLeaseError } = await admin
    .from("matchmaking_tickets")
    .update({ expires_at: "infinity" })
    .eq("id", joiner.id);
  if (joinerLeaseError) throw joinerLeaseError;

  try {
    const rankedTarget = rankCandidates(target, [joiner], rules);
    if (!rankedTarget.length) {
      throw new AppError("DIRECT_JOIN_INCOMPATIBLE", "这位玩家的匹配条件刚刚发生变化，请重新选择", 409, true);
    }
    const compatibility = rankedTarget[0].compatibility;
    if (target.mode === "casual") {
      let groupId = target.groupId || null;
      if (!groupId) {
        const { data: group, error: groupError } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: target.id });
        if (groupError) throw groupError;
        groupId = group?.id || null;
      }
      if (!groupId) throw new AppError("DIRECT_JOIN_UNAVAILABLE", "这支队伍刚刚发生变化，请重新选择", 409, true);
      recordReservationAttempt("group");
      const { data: reservation, error: reserveError } = await admin.rpc("matchmaking_reserve_group_member", {
        p_group_id: groupId,
        p_ticket_id: joiner.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (isGroupReservationConflict(reserveError, reservation)) {
        recordReservationConflict("group");
        throw new AppError("GROUP_RESERVATION_CONFLICT", "这位玩家刚刚被其他队伍占用，请重新选择", 409, true);
      }
      if (reserveError) throw reserveError;
    } else {
      recordReservationAttempt("pair");
      const { data: pair, error: reserveError } = await admin.rpc("matchmaking_reserve_pair", {
        p_ticket_a: joiner.id,
        p_ticket_b: target.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (isPairReservationConflict(reserveError, pair)) {
        recordReservationConflict("pair");
        throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请重新选择", 409, true);
      }
      if (reserveError) throw reserveError;
      if (!pair?.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
      if (!["matched", "playing"].includes(String(pair.state))) {
        const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
        if (presentError) throw presentError;
        await autoConnectPair(pair.id, requestId ? `auto-join:${requestId}` : `auto-join:${pair.id}`);
      }
    }
  } catch (error) {
    await admin.rpc("matchmaking_cancel_ticket", {
      p_user_id: userId,
      p_reason: "direct_join_failed",
      p_request_id: requestId,
    });
    throw error;
  }

  return matchmakingStatus(userId);
}

export function joinPublicTicket(userId: string, targetTicketId: string, requestId: string | null) {
  return withMatchmakingSerial(userId, () => joinPublicTicketInternal(userId, targetTicketId, requestId));
}

export async function matchmakingStatus(userId: string) {
  const admin = supabaseAdmin();
  const ticket = await activeTicketRow(userId);

  const [{ count: matching }, { count: matchable }, { data: directoryRows }] = await Promise.all([
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching"),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("game_id", "deadlock"),
    admin
      .from("matchmaking_tickets")
      .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference,search_started_at")
      .eq("state", "searching")
      .eq("game_id", "deadlock")
      .neq("user_id", userId)
      .order("search_started_at", { ascending: true })
      .limit(8),
  ]);

  // This is a deliberately small, privacy-safe lobby preview. It reveals only
  // the preferences a player has already made public by entering the pool.
  const directoryTickets = (directoryRows || []) as Array<Record<string, any>>;
  const directoryProfiles = await publicProfilesFor(directoryTickets.map((row) => row.user_id), { onlineOnly: true });
  const directoryProfileById = new Map(directoryProfiles.map((profile) => [profile.id, profile]));
  const directory = directoryTickets
    .filter((row) => directoryProfileById.has(row.user_id))
    .map((row) => ({
      ticketId: row.id,
      nickname: directoryProfileById.get(row.user_id)?.nickname || "玩家",
      gameId: row.game_id || "deadlock",
      mode: row.mode,
      rankCode: row.rank_code || null,
      desiredRoles: row.desired_roles || [],
      microphonePreference: row.microphone_preference || "any",
    }));

  if (!ticket) return { ticket: null, pair: null, group: null, candidate: null, matching: matching || 0, matchable: matchable || 0, directory };
  let ticketRoomCode: string | null = null;
  if (ticket.room_id) {
    const { data: room } = await admin.from("rooms").select("code").eq("id", ticket.room_id).maybeSingle();
    ticketRoomCode = room?.code || null;
  }
  let pair: Record<string, any> | null = null;
  let candidate = null;
  const group = ticket.group_id ? await groupSnapshot(ticket.group_id, userId) : null;
  if (ticket.pair_id) {
    const { data, error } = await admin.from("matchmaking_pairs").select("*").eq("id", ticket.pair_id).maybeSingle();
    if (error) throw error;
    pair = data;
    if (pair) {
      const candidateId = pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
      const candidateTicketId = pair.ticket_a_id === ticket?.id ? pair.ticket_b_id : pair.ticket_a_id;
      const [{ data: candidateTicket, error: candidateTicketError }, candidateProfiles] = await Promise.all([
        admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").eq("id", candidateTicketId).maybeSingle(),
        publicProfilesFor([candidateId]),
      ]);
      if (candidateTicketError) throw candidateTicketError;
      const candidateProfile = candidateProfiles[0] || null;
      candidate = candidateProfile ? {
        ...candidateProfile,
        rankCode: candidateTicket?.rank_code || null,
        microphonePreference: candidateTicket?.microphone_preference || "any",
        mode: candidateTicket?.mode || "ranked",
      } : null;
      const { data: confirmations } = await admin.from("matchmaking_confirmations").select("user_id,decision,responded_at").eq("pair_id", pair.id);
      let roomCode: string | null = null;
      if (pair.room_id) {
        const { data: room } = await admin.from("rooms").select("code").eq("id", pair.room_id).maybeSingle();
        roomCode = room?.code || null;
      }
      pair = { ...pair, confirmations: confirmations || [], roomCode };
    }
  }
  return { ticket: { ...ticket, roomCode: ticketRoomCode }, pair, group, candidate, matching: matching || 0, matchable: matchable || 0, directory };
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
    return data;
  }
  const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_ticket", {
    p_user_id: userId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) throw error;
  await reconcileOrphanWaitingRooms(userId, requestId);
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
