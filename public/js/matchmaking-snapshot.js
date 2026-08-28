const TERMINAL_MATCH_STATES = ["cancelled", "expired", "completed"];
const ACTIVE_TICKET_STATES = ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"];

export function isLiveMatchmakingSnapshot(ticket, pair = null, group = null, now = Date.now()) {
  if (!ticket) return false;
  const expiresAt = ticket.expires_at || ticket.expiresAt;
  if (["searching", "candidate_found", "waiting_confirmation"].includes(ticket.state)
      && expiresAt
      && new Date(expiresAt).getTime() <= now) {
    return false;
  }
  if (pair && TERMINAL_MATCH_STATES.includes(pair.state)) return false;
  if (group && TERMINAL_MATCH_STATES.includes(group.state)) return false;
  return ACTIVE_TICKET_STATES.includes(ticket.state);
}

export function matchmakingShape(match) {
  const confirmations = (match?.pair?.confirmations || [])
    .map((confirmation) => `${confirmation.user_id}:${confirmation.decision || "pending"}`)
    .sort();
  return JSON.stringify([
    match?.lifecycle?.state || null,
    match?.pair?.id || null,
    match?.pair?.state || null,
    match?.candidate?.id || null,
    match?.candidate?.rankCode || match?.candidate?.rank_code || null,
    match?.candidate?.microphonePreference || match?.candidate?.microphone_preference || null,
    confirmations,
    match?.group?.id || null,
    match?.group?.state || null,
    (match?.group?.members || []).map((member) => `${member.userId}:${member.decision}:${member.rankCode || member.rank_code || ""}:${member.microphonePreference || member.microphone_preference || ""}`).sort(),
  ]);
}

function liveEntity(active, entity) {
  return active && entity && !TERMINAL_MATCH_STATES.includes(entity.state) ? entity : null;
}

export function mergeMatchmakingSnapshot(previousMatch, snapshot, notice = "") {
  const ticket = snapshot.ticket || null;
  const active = isLiveMatchmakingSnapshot(ticket, snapshot.pair || null, snapshot.group || null);
  const pair = liveEntity(active, snapshot.pair);
  const group = liveEntity(active, snapshot.group);
  const candidate = pair ? (snapshot.candidate || null) : null;
  const timedOut = previousMatch?.pair?.state === "waiting_confirmation" && !pair && ticket?.state === "searching";
  return {
    active,
    pair,
    group,
    candidate,
    match: {
      ...previousMatch,
      status: active ? "active" : "idle",
      online: snapshot.online ?? previousMatch.online ?? 0,
      pool: snapshot.matching ?? previousMatch.pool,
      matchable: snapshot.matchable ?? previousMatch.matchable ?? 0,
      directory: Array.isArray(snapshot.directory) ? snapshot.directory : previousMatch.directory || [],
      lifecycle: active ? ticket : null,
      pair,
      group,
      candidate,
      notice: notice || (timedOut
        ? "对方已离开匹配，正在继续寻找其他玩家。"
        : (!active && ticket ? "匹配状态已结束，请重新开始。" : (pair ? "" : previousMatch.notice || ""))),
    },
  };
}

export function mergePartialMatchmakingSnapshot(previousMatch, summaryMatch, snapshot) {
  const ticket = snapshot.ticket || null;
  const active = isLiveMatchmakingSnapshot(ticket, snapshot.pair || null, snapshot.group || null);
  const pair = liveEntity(active, snapshot.pair);
  const group = liveEntity(active, snapshot.group);
  const hasGroupField = Object.prototype.hasOwnProperty.call(snapshot, "group");
  const hasTicketField = Object.prototype.hasOwnProperty.call(snapshot, "ticket");
  const partial = !hasGroupField && snapshot.ticket === null;
  const timedOut = previousMatch?.pair?.state === "waiting_confirmation" && !snapshot.pair && snapshot.ticket?.state === "searching";
  return {
    hasTicketField,
    active,
    partial,
    match: {
      ...summaryMatch,
      status: (partial || (!hasTicketField && previousMatch.status === "active")) ? "active" : (active ? "active" : "idle"),
      pool: snapshot.matching ?? summaryMatch.pool,
      matchable: snapshot.matchable ?? 0,
      directory: Array.isArray(snapshot.directory) ? snapshot.directory : previousMatch.directory || [],
      lifecycle: partial || !hasTicketField ? previousMatch.lifecycle : (active ? ticket : null),
      pair: partial || !hasTicketField ? previousMatch.pair : pair,
      group: hasGroupField ? group : previousMatch.group,
      candidate: pair ? (snapshot.candidate || null) : (partial || !hasTicketField ? previousMatch.candidate : null),
      notice: pair ? "" : (timedOut
        ? "对方已离开匹配，正在继续寻找其他玩家。"
        : (!active && hasTicketField && ticket ? "匹配状态已结束，请重新开始。" : previousMatch.notice || "")),
    },
  };
}
