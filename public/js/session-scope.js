export function sessionBelongsToRoom(session, room) {
  if (!session || !room) return false;
  const roomId = String(room.id || "");
  const sessionRoomId = String(session.roomId || session.room_id || "");
  if (roomId && sessionRoomId) return roomId === sessionRoomId;
  const roomCode = String(room.code || "");
  const sessionRoomCode = String(session.roomCode || session.room_code || "");
  return Boolean(roomCode && sessionRoomCode && roomCode === sessionRoomCode);
}

