import { publicProfilesFor } from "../data";
import { AppError } from "../http";
import { supabaseAdmin } from "../supabase";
import { evaluateCompatibility, rankCandidates, teammateRange } from "./rules";
import type { MatchGroup, MatchGroupMember, MatchTicket, MatchmakingInput, MatchmakingRuleSet } from "./types";

type TicketRow = Record<string, any>;

function ticketFromRow(row: TicketRow): MatchTicket {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const legacyRoles = Array.isArray(row.desired_roles) ? row.desired_roles : [];
  const hasOwnRoles = Array.isArray(metadata.ownRoles);
  const hasTeammateRoles = Array.isArray(metadata.teammateRoles);
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    mode: row.mode,
    rankCode: row.rank_code,
    desiredRoles: row.desired_roles || [],
    // Preserve the old desired_roles signal for tickets created before the
    // split role fields were introduced. New tickets always write both arrays
    // into metadata, including an explicit empty array for “不限”.
    ownRoles: hasOwnRoles ? metadata.ownRoles : legacyRoles,
    teammateRoles: hasTeammateRoles ? metadata.teammateRoles : legacyRoles,
    microphonePreference: row.microphone_preference,
    state: row.state,
    searchStartedAt: row.search_started_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    groupId: row.group_id || null,
  };
}

function groupFromRow(row: TicketRow, members: MatchGroupMember[] = []): MatchGroup {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    state: row.state,
    gameId: row.game_id,
    mode: "casual",
    desiredTeammates: Number(row.desired_teammates || 1),
    minTeammates: Number(row.min_teammates || 1),
    confirmationDeadline: row.confirmation_deadline || null,
    roomId: row.room_id || null,
    sessionId: row.session_id || null,
    members,
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

function groupRangeAllows(groupRow: TicketRow, candidate: MatchTicket, currentTeammates = 0) {
  const candidateRange = teammateRange(candidate);
  if (!candidateRange) return true;
  const groupMin = Math.max(1, Number(groupRow.min_teammates || 1));
  const groupMax = Math.min(5, Number(groupRow.desired_teammates || groupMin));
  if (groupMin > groupMax) return false;
  const intersectionMin = Math.max(groupMin, candidateRange.min);
  const intersectionMax = Math.min(groupMax, candidateRange.max);
  return intersectionMin <= intersectionMax && currentTeammates <= intersectionMax;
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
  const ticket = data as TicketRow | null;
  if (!ticket) return null;
  // ticket.expires_at is intentionally ignored. Active rows are closed only
  // by an explicit cancel/leave/offline action.
  return ticket;
}

async function attemptMatch(userId: string) {
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
    // Ranked pairs are direct connections: once a compatible second player
    // enters the pair, both tickets are accepted server-side and the room is
    // created atomically. The confirmation rows remain as an audit trail, but
    // neither player needs to click a second consent button.
    await autoConnectPair(pair.id, requestIdForAutoConnect(source.id, candidate.ticket.id));
    break;
  }
  return activeTicketRow(userId);
}

function requestIdForAutoConnect(ticketA: string, ticketB: string) {
  return `auto-pair:${ticketA}:${ticketB}`;
}

async function autoConnectPair(pairId: string, requestId: string | null = null) {
  const admin = supabaseAdmin();
  const { data: pair, error: pairError } = await admin
    .from("matchmaking_pairs")
    .select("id,user_a_id,user_b_id,state")
    .eq("id", pairId)
    .maybeSingle();
  if (pairError) throw pairError;
  if (!pair || ["playing", "matched", "completed"].includes(pair.state)) return pair;
  if (pair.state !== "waiting_confirmation") return pair;

  for (const userId of [pair.user_a_id, pair.user_b_id]) {
    const { error } = await admin.rpc("matchmaking_confirm_pair", {
      p_pair_id: pair.id,
      p_user_id: userId,
      p_decision: "accepted",
      p_request_id: `${requestId || `auto-pair:${pair.id}`}:${userId}`,
    });
    if (error) throw error;
  }
  return pair;
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
  const members = (memberRows || []) as TicketRow[];
  const ticketIds = members.map((member) => member.ticket_id).filter(Boolean);
  const { data: memberTickets, error: ticketError } = ticketIds.length
    ? await admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").in("id", ticketIds)
    : { data: [], error: null };
  if (ticketError) throw ticketError;
  const ticketById = new Map((memberTickets || []).map((ticket) => [ticket.id, ticket]));
  const profiles = await publicProfilesFor(members.map((member) => member.user_id));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const group = groupFromRow(groupRow, members.map((member) => ({
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
    const { data: room } = await admin.from("rooms").select("code").eq("id", group.roomId).maybeSingle();
    group.roomCode = room?.code || null;
  }
  return group.members.some((member) => member.userId === viewerId) ? group : null;
}

async function attemptCasualGroup(userId: string) {
  const admin = supabaseAdmin();
  let sourceRow = await activeTicketRow(userId);
  if (!sourceRow || sourceRow.mode !== "casual" || sourceRow.state !== "searching") return sourceRow;
  const { data: ruleRow, error: ruleError } = await admin.from("matchmaking_rule_sets").select("*").eq("id", sourceRow.rule_set_id).single();
  if (ruleError || !ruleRow) throw ruleError || new Error("MATCH_RULE_SET_MISSING");
  const rules = rulesFromRow(ruleRow);
  const source = ticketFromRow(sourceRow);

  // Prefer an existing group. This is the common case when the owner starts
  // first and teammates arrive later.
  const { data: openGroups, error: openGroupError } = await admin
    .from("matchmaking_groups")
    .select("*")
    .eq("game_id", source.gameId)
    .in("state", ["searching", "partial_ready"])
    .neq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(24);
  if (openGroupError) throw openGroupError;
  for (const groupRow of (openGroups || []) as TicketRow[]) {
    const { count } = await admin.from("matchmaking_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupRow.id).neq("decision", "rejected");
    const currentTeammates = Math.max(0, Number(count || 1) - 1);
    if (currentTeammates >= Number(groupRow.desired_teammates || 1)) continue;
    const { data: ownerRow } = await admin.from("matchmaking_tickets").select("*").eq("group_id", groupRow.id).eq("user_id", groupRow.owner_user_id).maybeSingle();
    if (!ownerRow) continue;
    const ownerTicket = ticketFromRow(ownerRow);
    const ownerCandidates = rankCandidates(ownerTicket, [source], rules);
    if (!ownerCandidates.length) continue;
    const compatibility = ownerCandidates[0].compatibility;
    if (!groupRangeAllows(groupRow, source, currentTeammates)) continue;
    const { error } = await admin.rpc("matchmaking_reserve_group_member", {
      p_group_id: groupRow.id,
      p_ticket_id: source.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: compatibility.softSignals,
    });
    if (!error) {
      sourceRow = await activeTicketRow(userId);
      break;
    }
    if (error.code !== "40001" && !error.message?.includes("GROUP_RESERVATION_CONFLICT") && !error.message?.includes("GROUP_SIZE_CONFLICT")) throw error;
  }

  if (!sourceRow?.group_id) {
    const { error: groupError } = await admin.rpc("matchmaking_ensure_group", { p_ticket_id: source.id });
    if (groupError) throw groupError;
    sourceRow = await activeTicketRow(userId);
  }
  if (!sourceRow?.group_id) return sourceRow;
  const { data: ownGroup } = await admin.from("matchmaking_groups").select("*").eq("id", sourceRow.group_id).maybeSingle();
  if (!ownGroup || ownGroup.owner_user_id !== userId || !["searching", "partial_ready"].includes(ownGroup.state)) return sourceRow;

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
  const { count: existingCount } = await admin.from("matchmaking_group_members").select("id", { count: "exact", head: true }).eq("group_id", ownGroup.id).neq("decision", "rejected");
  let teammateCount = Math.max(0, Number(existingCount || 1) - 1);
  const ranked = rankCandidates(source, (candidates || []).map(ticketFromRow), rules);
  for (const candidate of ranked) {
    if (teammateCount >= Number(ownGroup.desired_teammates || source.desiredTeammates || 1)) break;
    if (!groupRangeAllows(ownGroup, candidate.ticket, teammateCount)) continue;
    const { error } = await admin.rpc("matchmaking_reserve_group_member", {
      p_group_id: ownGroup.id,
      p_ticket_id: candidate.ticket.id,
      p_hard_snapshot: { passed: true, ruleSetVersion: rules.version },
      p_soft_snapshot: candidate.compatibility.softSignals,
    });
    if (!error) teammateCount += 1;
    else if (error.code !== "40001" && !error.message?.includes("GROUP_RESERVATION_CONFLICT") && !error.message?.includes("GROUP_SIZE_CONFLICT")) throw error;
  }
  return activeTicketRow(userId);
}

export async function startTicket(userId: string, input: MatchmakingInput, requestId: string | null) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("matchmaking_start_ticket", {
    p_user_id: userId,
    p_input: input,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (data?.id) {
    const currentMetadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const { error: metadataError } = await admin
      .from("matchmaking_tickets")
      .update({
        metadata: {
          ...currentMetadata,
          ownRoles: input.ownRoles || [],
          teammateRoles: input.teammateRoles || [],
        },
        // Search tickets remain active until the player explicitly cancels
        // or leaves the site. This is deliberately not a lease.
        expires_at: "infinity",
      })
      .eq("id", data.id);
    if (metadataError) throw metadataError;
  }
  if (input.mode === "casual") await attemptCasualGroup(userId);
  else await attemptMatch(userId);
  return matchmakingStatus(userId);
}

/**
 * Join one of the privacy-safe public matchmaking entries directly. The
 * target ticket is revalidated and reserved atomically by the existing pair /
 * group RPCs, so a stale card cannot create a ghost ticket or bypass the
 * normal hard compatibility rules.
 */
export async function joinPublicTicket(userId: string, targetTicketId: string, requestId: string | null) {
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
  const rules = rulesFromRow(ruleRow);
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
      const { error: reserveError } = await admin.rpc("matchmaking_reserve_group_member", {
        p_group_id: groupId,
        p_ticket_id: joiner.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (reserveError) throw reserveError;
    } else {
      const { data: pair, error: reserveError } = await admin.rpc("matchmaking_reserve_pair", {
        p_ticket_a: joiner.id,
        p_ticket_b: target.id,
        p_hard_snapshot: { passed: true, source: "public_direct_join", ruleSetVersion: rules.version },
        p_soft_snapshot: { ...compatibility.softSignals, source: "public_direct_join" },
      });
      if (reserveError) throw reserveError;
      if (!pair?.id) throw new AppError("DIRECT_JOIN_FAILED", "加入匹配失败，请重试", 500, true);
      const { error: presentError } = await admin.rpc("matchmaking_present_pair", { p_pair_id: pair.id });
      if (presentError) throw presentError;
      await autoConnectPair(pair.id, requestId ? `auto-join:${requestId}` : `auto-join:${pair.id}`);
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
  const directoryTickets = (directoryRows || []) as TicketRow[];
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
  let pair: TicketRow | null = null;
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
  return { ticket, pair, group, candidate, matching: matching || 0, matchable: matchable || 0, directory };
}

export async function cancelTicket(userId: string, reason: string, requestId: string | null) {
  const active = await activeTicketRow(userId);
  if (active?.mode === "casual" && active.group_id) {
    const { data, error } = await supabaseAdmin().rpc("matchmaking_cancel_group", {
      p_user_id: userId,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error) throw error;
    return data;
  }
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
  return matchmakingStatus(userId);
}

export async function startGroup(userId: string, groupId: string, requestId: string | null) {
  if (!groupId) throw new AppError("GROUP_INVALID", "队伍信息无效", 422);
  const { data, error } = await supabaseAdmin().rpc("matchmaking_start_group", {
    p_group_id: groupId,
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (error) throw error;
  return matchmakingStatus(userId);
}

export async function confirmGroup(userId: string, groupId: string, decision: string, requestId: string | null) {
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
