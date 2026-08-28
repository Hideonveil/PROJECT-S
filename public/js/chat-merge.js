function messageKey(message) {
  return String(message?.client_operation_id || message?.id || `${message?.sender_id || ""}:${message?.created_at || ""}:${message?.content || ""}`);
}

/** Merge acknowledgement, realtime and recovery reads without duplicate chat bubbles. */
export function mergeRoomMessages(current = [], incoming = [], roomId = "") {
  const byKey = new Map();
  [...current, ...incoming]
    .filter((message) => !roomId || !message?.room_id || message.room_id === roomId)
    .forEach((message) => {
    if (message && typeof message === "object") {
      const key = messageKey(message);
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...message } : message);
    }
  });
  return Array.from(byKey.values()).sort((a, b) => {
    const timeDiff = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    return timeDiff || messageKey(a).localeCompare(messageKey(b));
  });
}
