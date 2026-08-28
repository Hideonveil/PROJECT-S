const ROLE_NAMES: Record<string, string> = {
  "1": "主核",
  "2": "伪核",
  "3": "坦克",
  "4": "游走",
  "5": "辅助",
  "6": "功能",
};

export function roleLabels(roles: unknown): string {
  const values = Array.isArray(roles) ? roles : [];
  return values.length
    ? values.map((role) => ROLE_NAMES[String(role)] || `${role}号位`).join(" / ")
    : "位置不限";
}

export function roomMemberNeed(
  ticket: Record<string, any> | undefined,
  roomNeed: Record<string, any>,
  memberCount: number,
) {
  if (!ticket) return null;
  const roles = Array.isArray(ticket.desired_roles) ? ticket.desired_roles : [];
  const metadata = ticket.metadata && typeof ticket.metadata === "object" ? ticket.metadata : {};
  const ownRoles = Array.isArray(metadata.ownRoles) ? metadata.ownRoles : roles;
  const teammateRoles = Array.isArray(metadata.teammateRoles) ? metadata.teammateRoles : [];
  const microphone = ticket.microphone_preference || "any";
  return {
    game: ticket.game_id || roomNeed.game || "deadlock",
    mode: ticket.mode || roomNeed.mode || "ranked",
    goal: ticket.mode === "casual" ? "休闲" : "冲分",
    target: Number(roomNeed.target) || memberCount || 2,
    current: memberCount || 1,
    desiredTeammates: ticket.desired_teammates ?? null,
    minTeammates: ticket.min_teammates ?? null,
    time: "现在",
    voice: microphone !== "off",
    details: {
      rank: ticket.rank_code || "",
      role: roleLabels(ownRoles),
      teammateRole: roleLabels(teammateRoles),
      voicePreference: microphone,
    },
  };
}

export function roomShellNeed(ticket: Record<string, any> | null, roomNeed: Record<string, any>) {
  if (!ticket) return roomNeed;
  const metadata = ticket.metadata && typeof ticket.metadata === "object" ? ticket.metadata : {};
  const existingDetails = roomNeed.details && typeof roomNeed.details === "object" ? roomNeed.details : {};
  return {
    ...roomNeed,
    game: ticket.game_id || roomNeed.game || "deadlock",
    mode: ticket.mode || roomNeed.mode || "ranked",
    goal: ticket.mode === "casual" ? "休闲" : "冲分",
    rankCode: ticket.rank_code || roomNeed.rankCode || null,
    casualIntent: metadata.casualIntent || roomNeed.casualIntent || "default",
    target: Number(roomNeed.target) || Number(metadata.teamMax) || (ticket.mode === "ranked" ? 2 : 6),
    details: {
      ...existingDetails,
      rank: ticket.rank_code || existingDetails.rank || roomNeed.rankCode || "",
      role: roleLabels(metadata.ownRoles || ticket.desired_roles),
      teammateRole: roleLabels(metadata.teammateRoles),
      voicePreference: ticket.microphone_preference || existingDetails.voicePreference || "any",
    },
  };
}

export function roomRecruitmentPresentation(
  roomStatusValue: unknown,
  sessionStatusValue: unknown,
  formationStateValue: unknown,
) {
  const roomStatus = String(roomStatusValue || "").toLowerCase();
  const sessionStatus = String(sessionStatusValue || "").toLowerCase();
  const formationState = String(formationStateValue || "").toLowerCase();
  const hasFormalSession = ["ready", "playing", "completed", "cancelled"].includes(sessionStatus);
  const locked = hasFormalSession || ["locked", "formal"].includes(formationState);
  const recruiting = roomStatus === "connecting" && !locked;
  return {
    recruiting,
    recruitmentState: recruiting ? "recruiting" as const : locked ? "locked" as const : null,
    isForming: ["forming", "backfilling", "locked"].includes(formationState),
  };
}
