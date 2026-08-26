import { getSupabaseClient, getState } from "./api.js";

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
  let pollDelay = 4000;
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
  const refresh = async () => {
    if (closed) return false;
    try {
      const data = await getState();
      if (closed) return false;
      handlers.hello?.(data);
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
  if (closed || !session) return () => cleanup();

  const channel = sb.channel("node-events");
  const onStatus = (status) => {
    if (closed) return;
    handlers.connection?.(status);
    if (status === "SUBSCRIBED") {
      clearPoll();
      pollDelay = 4000;
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
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async () => {
      if (closed) return;
      try {
        const data = await getState();
        if (closed) return;
        handlers.hello?.(data);
        if (data.room) handlers.room?.({ room: data.room });
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        if (!closed) handlers.connection?.("offline");
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, async () => {
      if (closed) return;
      try {
        const data = await getState();
        if (closed) return;
        handlers.hello?.(data);
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        if (!closed) handlers.connection?.("offline");
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, async (payload) => {
      if (closed) return;
      try {
        const data = await getState();
        if (closed) return;
        handlers.hello?.(data);
        // A normal mutual goodbye updates the Session row. Do not rely on a
        // rooms event arriving first; the player who initiated the goodbye
        // must also receive the post-game feedback screen.
        const session = data.session ?? terminalSessionFromChange(payload);
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
