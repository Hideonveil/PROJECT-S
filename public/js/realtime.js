import { getConfig, getState } from "./api.js";

let client = null;
let refreshTimer = 0;

function debounceRefresh(token, handlers, ms = 300) {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(async () => {
    refreshTimer = 0;
    try {
      const data = await getState(token);
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

export async function openRealtime(token, handlers) {
  let closed = false;
  const sb = await getClient();
  if (!sb) {
    const timer = window.setInterval(async () => {
      if (closed) return;
      try {
        const data = await getState(token);
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
  const schedule = () => debounceRefresh(token, handlers);

  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "match_requests" }, schedule)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "applications" }, async (payload) => {
      try {
        const data = await getState(token);
        handlers.hello?.(data);
        const app = (data.applications || []).find((a) => a.id === payload.new?.id);
        if (app) handlers.application?.({ application: app });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, async (payload) => {
      try {
        const data = await getState(token);
        handlers.hello?.(data);
        if (payload.new?.status === "declined") handlers.declined?.({ applicationId: payload.new.id });
        if (payload.new?.status === "accepted" && data.room) handlers.room?.({ room: data.room });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, async () => {
      try {
        const data = await getState(token);
        handlers.hello?.(data);
        if (data.room) handlers.room?.({ room: data.room });
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sessions" }, async () => {
      try {
        const data = await getState(token);
        handlers.hello?.(data);
        if (data.session) handlers["game-over"]?.({ session: data.session });
      } catch {
        // ignore
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, async () => {
      try {
        const data = await getState(token);
        handlers.hello?.(data);
        const session = data.session;
        if (!session || !Array.isArray(session.players)) return;
        const decided = session.players.filter((p) => session.rematchBy?.[p]);
        if (decided.length === session.players.length) {
          const allYes = decided.every((p) => session.rematchBy[p] === "yes");
          if (allYes) handlers.connected?.({ friends: data.friends || [] });
          else handlers["rematch-result"]?.({ ok: false, session });
        }
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