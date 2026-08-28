import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import type { MatcherAttemptContext } from "./attempt-context";
import { autoConnectPair, autoConnectRequestId } from "./pair-lifecycle";
import { rulesFromRow, ticketFromRow, type MatchmakingRuleSetRow } from "./records";
import {
  RESERVATION_CONFLICT_BUDGET,
  isPairReservationConflict,
  recordReservationAttempt,
  recordReservationConflict,
} from "./reservations";
import { evaluateCompatibility, rankCandidates } from "./rules";
import { increment as incrementRuntimeMetric, observeLatency } from "./runtime-telemetry";
import { activeTicketRow } from "./ticket-store";

export async function attemptRankedMatch(userId: string, context?: MatcherAttemptContext) {
  const admin = supabaseAdmin();
  const sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.state !== "searching") return sourceRow;

  const { data: ruleRow, error: ruleError } = await admin
    .from("matchmaking_rule_sets")
    .select("*")
    .eq("id", sourceRow.rule_set_id)
    .single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");

  const { data: waitingRows, error: waitingError } = await admin
    .from("matchmaking_tickets")
    .select("*")
    .eq("game_id", sourceRow.game_id)
    .eq("state", "searching")
    .neq("user_id", userId)
    .order("search_started_at", { ascending: true })
    .limit(100);
  if (waitingError) throw waitingError;

  const source = ticketFromRow(sourceRow);
  const rules = rulesFromRow(ruleRow as MatchmakingRuleSetRow);
  const cooldownSeconds = Math.max(0, Number(rules.waitStrategy.rejectedPairCooldownSeconds || 0));
  const excludedUsers = new Set<string>();
  if (cooldownSeconds > 0) {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
    const { data: recentRejected } = await admin
      .from("matchmaking_pairs")
      .select("user_a_id,user_b_id")
      .in("state", ["cancelled", "expired"])
      .eq("cancel_reason", "rejected")
      .gte("updated_at", cutoff)
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
    for (const pair of recentRejected || []) {
      excludedUsers.add(pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id);
    }
  }
  const ranked = rankCandidates(
    source,
    (waitingRows || []).map(ticketFromRow).filter((ticket) => !excludedUsers.has(ticket.userId)),
    rules,
  );
  let conflictCount = 0;
  for (const candidate of ranked) {
    if (conflictCount >= RESERVATION_CONFLICT_BUDGET) break;
    if (context?.targetId && context.targetId === candidate.ticket.id) {
      incrementRuntimeMetric("same_target_suppressed");
      continue;
    }
    const compatibility = evaluateCompatibility(source, candidate.ticket, rules);
    recordReservationAttempt("pair");
    const { data: pair, error } = await admin.rpc("matchmaking_reserve_pair", {
      p_ticket_a: source.id,
      p_ticket_b: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: compatibility.softSignals,
    });
    if (error || isPairReservationConflict(null, pair)) {
      if (isPairReservationConflict(error, pair)) {
        conflictCount += 1;
        context?.recordBusinessConflict("MATCH_RESERVATION_CONFLICT", candidate.ticket.id);
        recordReservationConflict("pair");
        continue;
      }
      throw error;
    }
    if (context) {
      context.markSuccess(candidate.ticket.id);
      observeLatency("time_to_pair", Date.now() - context.startedAt);
      observeLatency("time_to_first_match", Date.now() - context.startedAt);
    }
    incrementRuntimeMetric("pair_success");
    if (!["matched", "playing"].includes(String(pair.state))) {
      const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
      if (presentError) throw presentError;
      await autoConnectPair(pair.id, autoConnectRequestId(source.id, candidate.ticket.id));
    }
    break;
  }
  return activeTicketRow(userId);
}

export async function previewOpsRankedMatch(userA: string, userB: string) {
  if (!userA || !userB || userA === userB) {
    throw new AppError("OPS_MATCH_INPUT_INVALID", "请选择两位不同的玩家", 422, false);
  }
  const [ticketA, ticketB] = await Promise.all([activeTicketRow(userA), activeTicketRow(userB)]);
  if (!ticketA || !ticketB || ticketA.mode !== "ranked" || ticketB.mode !== "ranked") {
    throw new AppError("OPS_MATCH_UNAVAILABLE", "两位玩家必须都在 Ranked 匹配池中", 409, true);
  }
  const { data: ruleRow, error } = await supabaseAdmin()
    .from("matchmaking_rule_sets")
    .select("*")
    .eq("id", ticketA.rule_set_id)
    .maybeSingle();
  if (error || !ruleRow) {
    throw error || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
  }
  const compatibility = evaluateCompatibility(
    ticketFromRow(ticketA),
    ticketFromRow(ticketB),
    rulesFromRow(ruleRow as MatchmakingRuleSetRow),
  );
  return { ticketA, ticketB, compatibility };
}

export async function forceOpsRankedMatch(userA: string, userB: string, reason: string, requestId: string) {
  const preview = await previewOpsRankedMatch(userA, userB);
  if (!preview.compatibility.compatible) {
    throw new AppError("OPS_MATCH_INCOMPATIBLE", "两位玩家当前不满足 Ranked 匹配规则", 409, false);
  }
  const { data: pair, error } = await supabaseAdmin().rpc("matchmaking_reserve_pair", {
    p_ticket_a: preview.ticketA.id,
    p_ticket_b: preview.ticketB.id,
    p_hard_snapshot: { passed: true, source: "ops_v2", reason: reason.slice(0, 200) },
    p_soft_snapshot: { ...preview.compatibility.softSignals, source: "ops_v2" },
  });
  if (isPairReservationConflict(error, pair)) {
    throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请刷新后重试", 409, true);
  }
  if (error || !pair?.id) throw error || new AppError("OPS_MATCH_FAILED", "人工匹配未能生成 Pair", 500, true);
  if (!["matched", "playing"].includes(String(pair.state))) {
    const { error: presentError } = await supabaseAdmin().rpc("matchmaking_present_pair", { p_pair_id: pair.id });
    if (presentError) throw presentError;
    await autoConnectPair(pair.id, `ops-v2:${requestId}`);
  }
  const { data: connectedPair, error: connectedPairError } = await supabaseAdmin()
    .from("matchmaking_pairs")
    .select("room_id")
    .eq("id", pair.id)
    .maybeSingle();
  if (connectedPairError) throw connectedPairError;
  return { pairId: pair.id, roomId: connectedPair?.room_id || pair.room_id || null, status: "matched" };
}
