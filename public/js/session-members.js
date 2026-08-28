/**
 * The browser used to derive a single `partner` from a room. Keep the
 * member arithmetic in one place so every lifecycle view uses the same
 * server-backed membership model.
 */
export function sessionMembers(source = {}, currentUserId = "", options = {}) {
  const includeExited = options?.includeExited === true;
  const raw = Array.isArray(source.members) && source.members.length
    ? source.members
    : Array.isArray(source.players)
      ? source.players
      : [];
  const seen = new Set();
  const members = raw
    .map((member, index) => {
      if (typeof member === "string") return { id: member, name: "玩家", memberStatus: "active" };
      if (!member?.id) return null;
      return { ...member, id: member.id };
    })
    .filter(Boolean)
    .filter((member) => {
      if (!member.id || seen.has(member.id)) return false;
      seen.add(member.id);
      return true;
    });
  const activeMembers = members.filter((member) => (member.memberStatus || member.status || "active") === "active");
  const visibleMembers = includeExited ? members : activeMembers;
  const currentMember = members.find((member) => member.id === currentUserId) || null;
  const otherMembers = visibleMembers.filter((member) => member.id !== currentUserId);
  const configuredTarget = Number(source.target ?? source.need?.target ?? 0);
  const targetTotalPlayers = Math.max(
    visibleMembers.length,
    configuredTarget > 0 ? configuredTarget : activeMembers.length,
    1,
  );
  const requestIds = new Set(
    (Array.isArray(source.goodbyeRequests) ? source.goodbyeRequests : [])
      .map((request) => request?.userId)
      .filter(Boolean),
  );
  const settlementIds = new Set(
    (Array.isArray(source.sessionSettlements) ? source.sessionSettlements : [])
      .map((settlement) => settlement?.userId)
      .filter(Boolean),
  );
  requestIds.forEach((id) => settlementIds.add(id));
  const participantIds = new Set(members.map((member) => member.id));
  const goodbyeCount = [...settlementIds].filter((id) => participantIds.has(id)).length;
  return {
    members,
    activeMembers,
    visibleMembers,
    currentMember,
    otherMembers,
    currentMemberCount: members.length,
    activeMemberCount: activeMembers.length,
    targetTotalPlayers,
    requestIds,
    settlementIds,
    goodbyeCount,
    goodbyeDenominator: Math.max(1, members.length),
  };
}

export function memberDisplayName(member, fallback = "玩家") {
  return member?.nickname || member?.name || member?.username || fallback;
}
