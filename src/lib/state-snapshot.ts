type RoomIdentity = { id?: unknown; code?: unknown } | null;
type SessionIdentity = { roomId?: unknown; room_id?: unknown; roomCode?: unknown; room_code?: unknown } | null;

function sessionBelongsToRoom(session: SessionIdentity, room: RoomIdentity) {
  if (!session || !room) return false;
  const roomId = String(room.id || "");
  const sessionRoomId = String(session.roomId || session.room_id || "");
  if (roomId && sessionRoomId) return roomId === sessionRoomId;
  const roomCode = String(room.code || "");
  const sessionRoomCode = String(session.roomCode || session.room_code || "");
  return Boolean(roomCode && sessionRoomCode && roomCode === sessionRoomCode);
}

export function selectSnapshotSession<T extends SessionIdentity>({
  room,
  activeSession,
  completedSession,
}: {
  room: RoomIdentity;
  activeSession: T;
  completedSession: T;
}): T {
  if (room) return sessionBelongsToRoom(activeSession, room) ? activeSession : null as T;
  return activeSession || completedSession;
}

