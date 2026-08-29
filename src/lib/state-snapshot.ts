type RoomIdentity = { id?: unknown; code?: unknown } | null;
type SessionIdentity = { id?: unknown; roomId?: unknown; room_id?: unknown; roomCode?: unknown; room_code?: unknown } | null;

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
  requestedCompletedSessionId,
}: {
  room: RoomIdentity;
  activeSession: T;
  completedSession: T;
  requestedCompletedSessionId?: string | null;
}): T {
  if (room) return sessionBelongsToRoom(activeSession, room) ? activeSession : null as T;
  if (activeSession) return activeSession;
  if (!completedSession || !requestedCompletedSessionId) return null as T;
  return String(completedSession.id || "") === requestedCompletedSessionId ? completedSession : null as T;
}
