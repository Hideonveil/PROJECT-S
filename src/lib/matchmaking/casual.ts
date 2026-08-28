import { publicProfilesFor } from "../data";
import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import type { MatcherAttemptContext } from "./attempt-context";
import {
  groupFromRow,
  rulesFromRow,
  ticketFromRow,
  type MatchmakingGroupRow,
  type MatchmakingRuleSetRow,
} from "./records";
import {
  CASUAL_BACKFILL_BUDGET,
  RESERVATION_CONFLICT_BUDGET,
  isGroupReservationConflict,
  recordReservationAttempt,
  recordReservationConflict,
} from "./reservations";
import { evaluateCompatibility, rankCandidates } from "./rules";
import { increment as incrementRuntimeMetric, observeLatency } from "./runtime-telemetry";
import { activeTicketRow } from "./ticket-store";

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

export async function groupSnapshot(groupId: string, viewerId: string) {
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

export async function attemptCasualGroup(userId: string, context?: MatcherAttemptContext) {
  const admin = supabaseAdmin();
  let sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.mode !== "casual") return sourceRow;
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", sourceRow.rule_set_id).single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");
  const rules = rulesFromRow(ruleRow as MatchmakingRuleSetRow);
  const source = ticketFromRow(sourceRow);

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
