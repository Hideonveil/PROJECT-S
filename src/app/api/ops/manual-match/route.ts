import { AppError, errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { publicProfilesFor } from "@/lib/data";
import { isOpsRequestAuthorized } from "@/lib/ops";
import { supabaseAdmin } from "@/lib/supabase";
import { evaluateCompatibility } from "@/lib/matchmaking/rules";
import type { MatchTicket, MatchmakingRuleSet } from "@/lib/matchmaking/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ticketView(row: Record<string, any>): MatchTicket {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    mode: row.mode,
    rankCode: row.rank_code || null,
    desiredRoles: row.desired_roles || [],
    microphonePreference: row.microphone_preference || "any",
    state: row.state,
    searchStartedAt: row.search_started_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    groupId: row.group_id || null,
  };
}

function manualCandidate(ticket: Record<string, any>, profile: Record<string, any> | undefined) {
  return {
    userId: ticket.user_id,
    ticketId: ticket.id,
    nickname: profile?.nickname || "未命名玩家",
    handle: profile?.handle || "",
    online: profile?.online !== false,
    gameId: ticket.game_id,
    mode: ticket.mode,
    rankCode: ticket.rank_code || null,
    desiredRoles: ticket.desired_roles || [],
    microphonePreference: ticket.microphone_preference || "any",
    desiredTeammates: Number(ticket.desired_teammates || 1),
    minTeammates: Number(ticket.min_teammates || ticket.desired_teammates || 1),
    searchStartedAt: ticket.search_started_at,
    expiresAt: ticket.expires_at,
  };
}

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    if (!(await isOpsRequestAuthorized(request))) {
      throw new AppError("OPS_UNAUTHORIZED", "没有权限查看人工匹配", 401);
    }
    const { data: tickets, error } = await supabaseAdmin()
      .from("matchmaking_tickets")
      .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference,desired_teammates,min_teammates,state,search_started_at,expires_at")
      .eq("state", "searching")
      .order("search_started_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    const rows = (tickets || []) as Array<Record<string, any>>;
    const profiles = await publicProfilesFor(rows.map((ticket) => ticket.user_id));
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    return jsonOk({
      candidates: rows.map((ticket) => manualCandidate(ticket, profileById.get(ticket.user_id))),
      limit: 100,
      note: "只显示当前仍在有效匹配池、尚未锁定的玩家。",
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "读取人工匹配候选失败");
  }
}

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    if (!(await isOpsRequestAuthorized(request))) {
      throw new AppError("OPS_UNAUTHORIZED", "没有权限执行人工匹配", 401);
    }
    const body = await jsonBody(request);
    const userA = String(body.userA || "").trim();
    const userB = String(body.userB || "").trim();
    if (!UUID.test(userA) || !UUID.test(userB) || userA === userB) {
      throw new AppError("OPS_MANUAL_MATCH_INVALID", "请选择两位不同的玩家", 422);
    }

    const admin = supabaseAdmin();
    const { data: tickets, error: ticketError } = await admin
      .from("matchmaking_tickets")
      .select("*")
      .in("user_id", [userA, userB])
      .eq("state", "searching");
    if (ticketError) throw ticketError;
    const byUser = new Map((tickets || []).map((ticket) => [ticket.user_id, ticket]));
    const ticketA = byUser.get(userA);
    const ticketB = byUser.get(userB);
    if (!ticketA || !ticketB) {
      throw new AppError("OPS_MANUAL_MATCH_UNAVAILABLE", "两位玩家必须都还在有效匹配池中", 409, true);
    }

    const { data: ruleRow, error: ruleError } = await admin
      .from("matchmaking_rule_sets")
      .select("*")
      .eq("id", ticketA.rule_set_id)
      .single();
    if (ruleError || !ruleRow) throw ruleError || new AppError("MATCH_RULE_SET_MISSING", "匹配规则暂不可用", 503, true);
    const rules: MatchmakingRuleSet = {
      id: ruleRow.id,
      gameId: ruleRow.game_id,
      version: ruleRow.version,
      hardRules: ruleRow.hard_rules,
      softPreferences: ruleRow.soft_preferences,
      waitStrategy: ruleRow.wait_strategy,
    };
    const compatibility = evaluateCompatibility(ticketView(ticketA), ticketView(ticketB), rules);
    if (!compatibility.compatible) {
      throw new AppError("OPS_MANUAL_MATCH_INCOMPATIBLE", `这两位玩家不满足硬性规则：${compatibility.hardFailures.join("、")}`, 422);
    }

    const { data: pair, error: reserveError } = await admin.rpc("matchmaking_reserve_pair", {
      p_ticket_a: ticketA.id,
      p_ticket_b: ticketB.id,
      p_hard_snapshot: { passed: true, source: "ops_manual", ruleSetVersion: rules.version },
      p_soft_snapshot: { ...compatibility.softSignals, source: "ops_manual", reason: String(body.reason || "运营人工匹配").slice(0, 200) },
    });
    if (pair?.ok === false && pair.reason === "MATCH_RESERVATION_CONFLICT") {
      throw new AppError("MATCH_RESERVATION_CONFLICT", "候选刚刚被其他匹配占用，请刷新候选后重试", 409, true);
    }
    if (reserveError) throw reserveError;
    const pairId = String(pair?.id || "");
    if (!UUID.test(pairId)) throw new AppError("OPS_MANUAL_MATCH_FAILED", "人工匹配未生成有效候选", 500, true);
    const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pairId });
    if (presentError) throw presentError;

    await admin.rpc("phase1_log_event", {
      p_event_name: "ops_manual_match",
      p_request_id: rid,
      p_properties: { userA, userB, pairId, source: "ops_manual", reason: String(body.reason || "").slice(0, 200) },
    });
    return jsonOk({ pairId, status: "waiting_confirmation", users: [userA, userB] }, rid);
  } catch (error) {
    return errorResponse(error, rid, "人工匹配失败，请刷新候选后重试");
  }
}
