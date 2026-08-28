export type RoomAuthority = { roomId: string | null; version: number | null };

export function canApplyRoomSnapshot(incoming: RoomAuthority, current: RoomAuthority): boolean {
  if (!incoming.roomId || incoming.roomId !== current.roomId) return true;
  if (current.version == null) return true;
  if (incoming.version == null) return false;
  return incoming.version >= current.version;
}

export function goodbyeSettlement(input: {
  participants: string[];
  goodbyeUserIds: string[];
  exitedUserIds?: string[];
}) {
  const participants = new Set(input.participants.filter(Boolean));
  const settledIds = new Set([...input.goodbyeUserIds, ...(input.exitedUserIds || [])].filter((id) => participants.has(id)));
  return {
    settled: settledIds.size,
    total: participants.size,
    completed: participants.size > 1 && settledIds.size === participants.size,
  };
}

export function recruitmentVoteState(input: {
  activeUserIds: string[];
  voteUserIds: string[];
  membershipVersion: number;
  voteMembershipVersion: number;
}) {
  const active = new Set(input.activeUserIds.filter(Boolean));
  const resetRequired = input.voteMembershipVersion < input.membershipVersion;
  const votes = resetRequired ? 0 : new Set(input.voteUserIds.filter((id) => active.has(id))).size;
  return {
    votes,
    total: active.size,
    locked: active.size > 1 && votes === active.size,
    resetRequired,
  };
}
