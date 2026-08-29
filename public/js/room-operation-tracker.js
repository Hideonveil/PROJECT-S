function stablePayload(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePayload).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stablePayload(value[key])}`).join(",")}}`;
}

export function createRoomOperationTracker({ createId } = {}) {
  const nextId = createId || (() => globalThis.crypto?.randomUUID?.() || `room-operation-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const byIntent = new Map();
  const intentById = new Map();

  function intentKey(roomId, action, payload) {
    return `${roomId}:${action}:${stablePayload(payload || {})}`;
  }

  function begin(roomId, action, payload = {}) {
    const key = intentKey(roomId, action, payload);
    const existing = byIntent.get(key);
    if (existing) return existing.id;
    const operation = { id: nextId(), state: "pending" };
    byIntent.set(key, operation);
    intentById.set(operation.id, key);
    return operation.id;
  }

  function markUnknown(operationId) {
    const key = intentById.get(operationId);
    if (!key) return;
    const operation = byIntent.get(key);
    if (operation?.id === operationId) operation.state = "unknown";
  }

  function forget(operationId) {
    const key = intentById.get(operationId);
    if (!key) return;
    const operation = byIntent.get(key);
    if (operation?.id === operationId) byIntent.delete(key);
    intentById.delete(operationId);
  }

  return {
    begin,
    markUnknown,
    complete: forget,
    fail: forget,
  };
}
