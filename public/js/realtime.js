import { getConfig, getState } from "./api.js";

let client = null;
let refreshTimer = 0;

function debounceRefresh(handlers, ms = 300) {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(async () => {
    refreshTimer = 0;
    try {
      const data = await getState();
      handlers.hello?.(data);
    } catch {
      // snapshot refresh is best-effort
    }
  }, ms);
}

async function getClient() {
  if (client) return client;
  const cfg = await getConfig();
  if (!window.supabase) return null;
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export async function openRealtime(handlers) {
  let closed = false;
  const sb = await getClient();
  if (!sb) {
    const timer = window.setInterval(async () => {
      if (closed) return;
      try {
        const data = await getState();
        handlers.hello?.(data);
      } catch {
        // offline snapshot refresh is best-effort
      }
    }, 4000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return () => {};

  const channel = sb.channel("node-events");
  const schedule = () => debounceRefresh(handlers);

  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_tickets" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_pairs" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_confirmations" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async () => {
      try {
        const data = await getState();
        handlers.hello?.(data);
        if (data.room) handlers.room?.({ room: data.room });
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, async () => {
      try {
        const data = await getState();
        handlers.hello?.(data);
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, async () => {
      try {
        const data = await getState();
        handlers.hello?.(data);
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, schedule);

  await channel.subscribe();
  return () => {
    closed = true;
    sb.removeChannel(channel);
  };
}
