import { publicProfilesFor } from "../data";
import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import { evaluateCompatibility, rankCandidates } from "./rules";
import type { MatchTicket, MatchmakingInput, MatchmakingRuleSet } from "./types";

type TicketRow = Record<string, any>;

function ticketFromRow(row: TicketRow): MatchTicket {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    mode: row.mode,
    rankCode: row.rank_code,
    desiredRoles: row.desired_roles || [],
    microphonePreference: row.microphone_preference,
    state: row.state,
    searchStartedAt: row.search_started_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
  };
}

function rulesFromRow(row: TicketRow): MatchmakingRuleSet {
  return {
    id: row.id,
    gameId: row.game_id,
    version: row.version,
    hardRules: row.hard_rules,
    softPreferences: row.soft_preferences,
    waitStrategy: row.wait_strategy,
  };
}

async function activeTicketRow(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    .select("*")
    .eq("user_id", userId)
    .in("state", ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TicketRow | null;
}

async function attemptMatch(userId: string) {
  const admin = supabaseAdmin();
  await admin.rpc("matchmaking_expire_stale");
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
    .gt("expires_at", new Date().toISOString())
    .neq("user_id", userId)
    .order("search_started_at", { ascending: true })
    .limit(100);
  if (waitingError) throw waitingError;

  const source = ticketFromRow(sourceRow);
  const rules = rulesFromRow(ruleRow);
  const cooldownSeconds = Math.max(0, Number(rules.waitStrategy.rejectedPairCooldownSeconds || 0));
  const excludedUsers = new Set<string>();
  if (cooldownSeconds > 0) {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
    const { data: recentRejected } = await admin
      .from("matchmaking_pairs")
      .select("user_a_id,user_b_id")
      .in("state", ["cancelled", "expired"])
      // A timeout often means a dropped/slow connection, not an intentional
      // rejection. Let those two players meet again immediately; only a clear
      // rejection starts the short pair cooldown.
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
    rules
  );
  for (const candidate of ranked) {
    const compatibility = evaluateCompatibility(source, candidate.ticket, rules);
    const { data: pair, error } = await admin.rpc("matchmaking_reserve_pair", {
      p_ticket_a: source.id,
      p_ticket_b: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: compatibility.softSignals,
    });
    if (error) {
      if (error.message?.includes("MATCH_RESERVATION_CONFLICT") || error.code === "40001") continue;
      throw error;
    }
    const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
    if (presentError) throw presentError;
    break;
  }
  return activeTicketRow(userId);
}

export async function startTicket(userId: string, input: MatchmakingInput, requestId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (error) throw error;
  await attemptMatch(userId);
  return matchmakingStatus(userId, false);
}

export async function matchmakingStatus(userId: string, heartbeat = true) {
  const admin = supabaseAdmin();
  if (heartbeat) {
    await admin.rpc("matchmaking_heartbeat", { p_user_id: userId });
    await admin.rpc("matchmaking_expire_stale");
  }
  const ticket = await activeTicketRow(userId);

  const [{ count: matching }, { count: matchable }] = await Promise.all([
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").gt("expires_at", new Date().toISOString()),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("game_id", "deadlock").gt("expires_at", new Date().toISOString()),
  ]);

  if (!ticket) return { ticket: null, pair: null, candidate: null, matching: matching || 0, matchable: matchable || 0 };
  let pair: TicketRow | null = null;
  let candidate = null;
  if (ticket.pair_id) {
    const { data, error } = await admin.from("matchmaking_pairs").select("*").eq("id", ticket.pair_id).maybeSingle();
    if (error) throw error;
    pair = data;
    if (pair) {
      const candidateId = pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
      candidate = (await publicProfilesFor([candidateId]))[0] || null;
      const { data: confirmations } = await admin.from("matchmaking_confirmations").select("user_id,decision,responded_at").eq("pair_id", pair.id);
      let roomCode: string | null = null;
      if (pair.room_id) {
        const { data: room } = await admin.from("rooms").select("code").eq("id", pair.room_id).maybeSingle();
        roomCode = room?.code || null;
      }
      pair = { ...pair, confirmations: confirmations || [], roomCode };
    }
  }
  return { ticket, pair, candidate, matching: matching || 0, matchable: matchable || 0 };
}

export async function cancelTicket(userId: string, reason: string, requestId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_ticket", {
    p_user_id: userId,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function confirmPair(userId: string, pairId: string, decision: string, requestId: string | null) {
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
  if (data?.state === "cancelled") await attemptMatch(userId);
  return matchmakingStatus(userId, false);
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
