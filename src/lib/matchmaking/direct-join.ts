import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import { autoConnectPair } from "./pair-lifecycle";
import { rulesFromRow, ticketFromRow, type MatchmakingRuleSetRow } from "./records";
import {
  isGroupReservationConflict,
  isPairReservationConflict,
  recordReservationAttempt,
  recordReservationConflict,
} from "./reservations";
import { rankCandidates } from "./rules";
import { matchmakingStatus } from "./status";
import { activeTicketRow } from "./ticket-store";
import type { MatchmakingInput } from "./types";

export async function joinPublicTicketOperation(userId: string, targetTicketId: string, requestId: string | null) {
  const admin = supabaseAdmin();
  const active = await activeTicketRow(userId);
  if (active) {
    if (requestId && active.request_id === requestId) return matchmakingStatus(userId);
    throw new AppError("MATCH_ALREADY_ACTIVE", "你已经在匹配中，请先退出当前匹配", 409);
  }

  const { data: targetRow, error: targetError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("id", targetTicketId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow || targetRow.user_id === userId || targetRow.state !== "searching") {
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
      await reserveCasualJoin(target.id, target.groupId || null, joiner.id, compatibility.softSignals, rules.version);
    } else {
      await reserveRankedJoin(target.id, joiner.id, compatibility.softSignals, rules.version, requestId);
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

async function reserveCasualJoin(targetTicketId: string, existingGroupId: string | null, joinerTicketId: string, softSignals: Record<string, unknown>, ruleSetVersion: string) {
  const admin = supabaseAdmin();
  let groupId = existingGroupId;
  if (!groupId) {
    const { data: group, error } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: targetTicketId });
    if (error) throw error;
    groupId = group?.id || null;
  }
  if (!groupId) throw new AppError("DIRECT_JOIN_UNAVAILABLE", "这支队伍刚刚发生变化，请重新选择", 409, true);
  recordReservationAttempt("group");
  const { data: reservation, error } = await admin.rpc("matchmaking_reserve_group_member", {
    p_group_id: groupId,
    p_ticket_id: joinerTicketId,
    p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion },
    p_soft_snapshot: { ...softSignals, source: "public_direct_join" },
  });
  if (isGroupReservationConflict(error, reservation)) {
    recordReservationConflict("group");
    throw new AppError("GROUP_RESERVATION_CONFLICT", "这位玩家刚刚被其他队伍占用，请重新选择", 409, true);
  }
  if (error) throw error;
}

async function reserveRankedJoin(targetTicketId: string, joinerTicketId: string, softSignals: Record<string, unknown>, ruleSetVersion: string, requestId: string | null) {
  const admin = supabaseAdmin();
  recordReservationAttempt("pair");
  const { data: pair, error } = await admin.rpc("matchmaking_reserve_pair", {
    p_ticket_a: joinerTicketId,
    p_ticket_b: targetTicketId,
    p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion },
    p_soft_snapshot: { ...softSignals, source: "public_direct_join" },
  });
  if (isPairReservationConflict(error, pair)) {
    recordReservationConflict("pair");
    throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请重新选择", 409, true);
  }
  if (error) throw error;
  if (!pair?.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
  if (["matched", "playing"].includes(String(pair.state))) return;
  const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
  if (presentError) throw presentError;
  await autoConnectPair(pair.id, requestId ? `auto-join:${requestId}` : `auto-join:${pair.id}`);
}
