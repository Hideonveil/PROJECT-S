import { getSupabaseClient, getState } from "./api.js?v=20260829-room-converge-03";
import { classifyRoomVersionEvent } from "./room-version-cursor.js";

// Realtime accelerates Room updates, but the server snapshot remains the
// source of truth. This sparse watchdog closes silent event gaps without
// recreating a high-frequency polling loop.
const ACTIVE_ROOM_RECONCILE_MS = 12_000;

function terminalSessionFromChange(payload) {
  const row = payload?.new;
  if (!row || !["completed", "cancelled"].includes(row.status)) return null;
  return {
    ...row,
    roomId: row.room_id ?? row.roomId ?? null,
    roomCode: row.room_code ?? row.roomCode ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    endedAt: row.ended_at ?? row.endedAt ?? null,
    completionReason: row.completion_reason ?? row.completionReason ?? null,
  };
}

export async function openRealtime(handlers) {
  let closed = false;
  let refreshTimer = 0;
  let pollTimer = 0;
  let roomReconcileTimer = 0;
  let pollDelay = 4000;
  const readState = async (completedSessionId = "") => {
    const observedGeneration = handlers.checkpoint?.();
    return { data: await getState({ completedSessionId }), observedGeneration };
  };
  const emitState = ({ data, observedGeneration }) => {
    handlers.hello?.(data, { observedGeneration });
  };
  const clearRefresh = () => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = 0;
    }
  };
  const clearPoll = () => {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = 0;
    }
  };
  const clearRoomReconciliation = () => {
    if (!roomReconcileTimer) return;
    window.clearTimeout(roomReconcileTimer);
    roomReconcileTimer = 0;
  };
  const startRoomReconciliation = (initialDelay = ACTIVE_ROOM_RECONCILE_MS) => {
    if (closed || roomReconcileTimer) return;
    const tick = () => {
      roomReconcileTimer = 0;
      if (closed) return;
      if (handlers.roomActive?.()) handlers.roomEvent?.({ source: "watchdog" });
      if (!closed) {
        const jitterMs = Math.floor(Math.random() * 2_000);
        roomReconcileTimer = window.setTimeout(tick, ACTIVE_ROOM_RECONCILE_MS + jitterMs);
      }
    };
    roomReconcileTimer = window.setTimeout(tick, initialDelay);
  };
  const refresh = async () => {
    if (closed) return false;
    try {
      const read = await readState();
      if (closed) return false;
      emitState(read);
      handlers.connection?.("online");
      return true;
    } catch {
      if (!closed) handlers.connection?.("offline");
      return false;
    }
  };
  const startPolling = () => {
    if (closed || pollTimer) return;
    const tick = async () => {
      pollTimer = 0;
      if (closed) return;
      const online = await refresh();
      if (!closed) {
        pollDelay = online ? 4000 : Math.min(30_000, Math.max(4000, pollDelay * 2));
        pollTimer = window.setTimeout(tick, pollDelay);
      }
    };
    pollTimer = window.setTimeout(tick, 0);
  };
  const schedule = () => {
    if (closed || refreshTimer) return;
    refreshTimer = window.setTimeout(async () => {
      refreshTimer = 0;
      await refresh();
    }, 300);
  };
  const cleanup = (channel = null, sb = null) => {
    closed = true;
    clearRefresh();
    clearPoll();
    clearRoomReconciliation();
    if (channel && sb) sb.removeChannel(channel);
  };

  let sb;
  try {
    sb = await getSupabaseClient();
  } catch {
    startPolling();
    return () => cleanup();
  }
  if (closed || !sb) {
    if (!closed) startPolling();
    return () => cleanup();
  }
  let session;
  try {
    ({ data: { session } } = await sb.auth.getSession());
  } catch {
    startPolling();
    return () => cleanup();
  }
  if (closed) return () => cleanup();
  // A freshly authenticated tab can reach the Room shell before Supabase has
  // hydrated its browser session. Realtime is only an accelerator; never
  // leave the client without an authoritative state path during that race.
  if (!session) {
    startPolling();
    return () => cleanup();
  }

  const channel = sb.channel("node-events");
  const onStatus = (status) => {
    if (closed) return;
    handlers.connection?.(status);
    if (status === "SUBSCRIBED") {
      clearPoll();
      pollDelay = 4000;
      if (handlers.roomActive?.()) handlers.roomEvent?.({ source: "reconnect", decision: "resync" });
      // The first short pass covers a match commit that races Room-shell
      // navigation; subsequent passes stay deliberately low-frequency.
      startRoomReconciliation(1_200 + Math.floor(Math.random() * 900));
    } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      startPolling();
    }
  };

  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_tickets" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_pairs" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_confirmations" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_groups" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_group_members" }, schedule)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_state_events" }, (payload) => {
      const checkpoint = handlers.roomCheckpoint?.() || {};
      const decision = classifyRoomVersionEvent(checkpoint, payload?.new);
      if (decision !== "ignore") handlers.roomEvent?.({ source: "room-state-event", decision, payload });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async () => {
      if (closed) return;
      try {
        const read = await readState();
        const { data } = read;
        if (closed) return;
        emitState(read);
        if (data.room) handlers.room?.({ room: data.room });
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        if (!closed) handlers.connection?.("offline");
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, async () => {
      if (closed) return;
      try {
        const read = await readState();
        const { data } = read;
        if (closed) return;
        emitState(read);
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        if (!closed) handlers.connection?.("offline");
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, async (payload) => {
      if (closed) return;
      try {
        const terminalFromChange = terminalSessionFromChange(payload);
        const read = await readState(terminalFromChange?.id || "");
        const { data } = read;
        if (closed) return;
        emitState(read);
        // A normal mutual goodbye updates the Session row. Do not rely on a
        // rooms event arriving first; the player who initiated the goodbye
        // must also receive the post-game feedback screen.
        const session = data.session ?? terminalFromChange;
        if (session && ["completed", "cancelled"].includes(session.status)) {
          handlers["game-over"]?.({ session });
        }
      } catch {
        if (!closed) handlers.connection?.("offline");
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "session_goodbye_requests" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "session_member_likes" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, (payload) => {
      handlers.roomEvent?.(payload);
      schedule();
    });

  try {
    await channel.subscribe(onStatus);
  } catch {
    if (!closed) startPolling();
  }
  return () => cleanup(channel, sb);
}
