const ROOM_SWITCH_SOURCES = new Set(["start", "resume-confirmed"]);
const AUTHORITATIVE_NULL_SOURCES = new Set(["state", "terminal", "exit-complete"]);

function finiteVersion(room, explicitVersion) {
  const value = explicitVersion ?? room?.realtimeVersion ?? room?.realtime_version;
  if (value === null || value === undefined || value === "") return null;
  const version = Number(value);
  return Number.isFinite(version) ? version : null;
}

function supplementRoom(current, incoming) {
  const result = { ...incoming, ...current };
  for (const [key, value] of Object.entries(incoming || {})) {
    const existing = current?.[key];
    if (existing === null || existing === undefined || existing === "") result[key] = value;
    else if (Array.isArray(existing) && existing.length === 0 && Array.isArray(value) && value.length > 0) result[key] = value;
  }
  return result;
}

function roomEffect(route, source, changed) {
  if (route === "home") return ROOM_SWITCH_SOURCES.has(source) ? "enter-room" : "prompt-resume";
  if (route === "matching") return "enter-room";
  if (route === "room" && changed) return "patch-room";
  return "none";
}

function unchangedRoomEffect(route, source) {
  return ROOM_SWITCH_SOURCES.has(source) || route === "matching" ? "enter-room" : "none";
}

/**
 * Owns the browser's accepted Room timeline. Callers submit facts; this module
 * decides whether they may change the current Room and which UI effect follows.
 */
export function createRoomAuthority({ normalizeRoom, roomSignature, isResumableRoom }) {
  let canonicalRoom = null;
  let canonicalVersion = null;
  let exitPendingRoomId = "";
  let generation = 0;
  const exitedRoomIds = new Set();

  function result(decision, effect = "none", extra = {}) {
    return { decision, effect, room: canonicalRoom, generation, ...extra };
  }

  function clearRoom(reason) {
    if (canonicalRoom) generation += 1;
    canonicalRoom = null;
    canonicalVersion = null;
    return result("clear", "clear-room", { reason });
  }

  function acceptSnapshot(event) {
    const incoming = event.room;
    if (incoming === null) {
      if (!AUTHORITATIVE_NULL_SOURCES.has(event.source)) {
        return result("ignore", "none", { reason: "non-authoritative-null" });
      }
      if (exitPendingRoomId) return result("ignore", "none", { reason: "exit-pending" });
      if (event.observedGeneration !== null
          && event.observedGeneration !== undefined
          && event.observedGeneration !== generation) {
        return result("ignore", "none", { reason: "stale-authority-generation" });
      }
      const incomingVersion = finiteVersion(null, event.snapshotVersion);
      if (canonicalVersion !== null && incomingVersion !== null && incomingVersion < canonicalVersion) {
        return result("ignore", "none", { reason: "older-version" });
      }
      return canonicalRoom ? clearRoom("authoritative-null") : result("noop");
    }
    if (!incoming?.id) return result("ignore", "none", { reason: "room-missing-id" });
    if (exitPendingRoomId === incoming.id) return result("ignore", "none", { reason: "exit-pending" });
    if (exitedRoomIds.has(incoming.id)) return result("ignore", "none", { reason: "exited-room" });
    if (canonicalRoom?.id && canonicalRoom.id !== incoming.id && !ROOM_SWITCH_SOURCES.has(event.source)) {
      return result("ignore", "none", { reason: "different-room" });
    }

    const incomingVersion = finiteVersion(incoming, event.snapshotVersion);
    if (canonicalRoom?.id === incoming.id && canonicalVersion !== null) {
      if (incomingVersion === null) {
        const supplemented = normalizeRoom(supplementRoom(canonicalRoom, incoming));
        const changed = roomSignature(supplemented) !== roomSignature(canonicalRoom);
        if (!changed) return result("noop");
        canonicalRoom = supplemented;
        return result("accept", roomEffect(event.route, event.source, true), { reason: "supplemented-unversioned" });
      }
      if (incomingVersion < canonicalVersion) return result("ignore", "none", { reason: "older-version" });
      if (incomingVersion === canonicalVersion
          && event.source !== "mutation"
          && !(canonicalRoom.shell === true && incoming.shell === false)) {
        const supplemented = normalizeRoom(supplementRoom(canonicalRoom, incoming));
        const changed = roomSignature(supplemented) !== roomSignature(canonicalRoom);
        if (!changed) return result("noop", unchangedRoomEffect(event.route, event.source));
        canonicalRoom = supplemented;
        return result("accept", roomEffect(event.route, event.source, true), { reason: "supplemented-same-version" });
      }
    }

    const preservesResolverEligibility = event.source === "mutation"
      && canonicalRoom?.id === incoming.id
      && canonicalRoom.resumeEligible === true;
    const versionedIncoming = {
      ...incoming,
      ...(incomingVersion === null ? {} : { realtimeVersion: incomingVersion }),
      ...(preservesResolverEligibility ? { resumeEligible: true } : {}),
    };
    const normalized = normalizeRoom(versionedIncoming);
    if (!isResumableRoom(normalized)) {
      return canonicalRoom?.id === incoming.id ? clearRoom("terminal-room") : result("ignore", "none", { reason: "terminal-room" });
    }

    const switchingRooms = Boolean(canonicalRoom?.id && canonicalRoom.id !== normalized.id);
    const acceptingRoomIdentity = !canonicalRoom?.id || switchingRooms;
    const changed = switchingRooms || !canonicalRoom || roomSignature(normalized) !== roomSignature(canonicalRoom);
    if (!changed) {
      if (incomingVersion !== null && (canonicalVersion === null || incomingVersion > canonicalVersion)) canonicalVersion = incomingVersion;
      return result("noop", unchangedRoomEffect(event.route, event.source));
    }

    if (acceptingRoomIdentity) generation += 1;
    canonicalRoom = normalized;
    canonicalVersion = incomingVersion;
    exitPendingRoomId = "";
    return result("accept", roomEffect(event.route, event.source, true));
  }

  function dispatch(event) {
    switch (event?.type) {
      case "snapshot":
        return acceptSnapshot(event);
      case "begin-exit":
        if (event.roomId) exitPendingRoomId = event.roomId;
        return result("noop");
      case "exit-failed":
        if (!event.roomId || exitPendingRoomId === event.roomId) exitPendingRoomId = "";
        return result("noop");
      case "exit-complete": {
        const roomId = event.roomId || exitPendingRoomId || canonicalRoom?.id || "";
        if (roomId) exitedRoomIds.add(roomId);
        exitPendingRoomId = "";
        return canonicalRoom?.id === roomId ? clearRoom("exit-complete") : result("noop");
      }
      case "terminal":
        return !event.roomId || canonicalRoom?.id === event.roomId ? clearRoom("terminal") : result("noop");
      case "inspect":
        return result("noop", "none", {
          blocked: Boolean(event.roomId && (exitPendingRoomId === event.roomId || exitedRoomIds.has(event.roomId))),
          exitPending: Boolean(event.roomId && exitPendingRoomId === event.roomId),
        });
      case "checkpoint":
        return result("noop");
      case "reset":
        generation += 1;
        canonicalRoom = null;
        canonicalVersion = null;
        exitPendingRoomId = "";
        exitedRoomIds.clear();
        return result("noop");
      default:
        return result("ignore", "none", { reason: "unknown-event" });
    }
  }

  return { dispatch };
}
