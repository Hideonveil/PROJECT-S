import type { Room, RoomMemberView } from "./types";

export type RoomSnapshot = {
  room: Room;
  snapshotVersion: string;
  generatedAt: string;
};

function isActiveMember(member: RoomMemberView) {
  return (member.memberStatus || "active") === "active";
}

/**
 * Project the authoritative enriched Room into the live-client contract.
 * Historical members remain in database/lifecycle records, but a live Room
 * roster must only contain members who can still act in that Room.
 */
export function liveRoomSnapshot(room: Room, generatedAt = new Date().toISOString()): RoomSnapshot {
  const members = (room.members || []).filter(isActiveMember);
  const players = members.map((member) => ({ ...member }));
  const fallbackVersion = JSON.stringify({
    roomId: room.id,
    status: room.status,
    recruitmentState: room.recruitmentState || null,
    formationState: room.formationState || null,
    sessionId: room.sessionId || null,
    sessionStatus: room.sessionStatus || null,
    members: members.map((member) => [member.id, member.memberStatus || "active", member.exitedAt || null]),
  });
  const snapshotVersion = Number.isFinite(Number(room.realtimeVersion))
    ? String(room.realtimeVersion)
    : fallbackVersion;
  return {
    room: {
      ...room,
      members,
      players,
      currentMemberCount: members.length,
      activeMemberCount: members.length,
      targetTotalPlayers: Math.max(room.targetTotalPlayers || 1, members.length),
    },
    snapshotVersion,
    generatedAt,
  };
}
