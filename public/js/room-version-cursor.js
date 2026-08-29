function finiteVersion(value) {
  if (value === null || value === undefined || value === "") return null;
  const version = Number(value);
  return Number.isFinite(version) ? version : null;
}

export function classifyRoomVersionEvent(cursor, event) {
  const currentRoomId = String(cursor?.roomId || "");
  const eventRoomId = String(event?.room_id || event?.roomId || "");
  if (!currentRoomId || !eventRoomId || currentRoomId !== eventRoomId) return "ignore";
  const currentVersion = finiteVersion(cursor?.version);
  const eventVersion = finiteVersion(event?.room_version ?? event?.roomVersion);
  if (eventVersion === null || currentVersion === null) return "resync";
  if (eventVersion <= currentVersion) return "ignore";
  return eventVersion === currentVersion + 1 ? "refresh" : "resync";
}
