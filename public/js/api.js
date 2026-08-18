let supabase = null;
let configCache = null;

async function request(path, body, token = null) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    const mutationId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    headers["X-Request-ID"] = mutationId;
    headers["Idempotency-Key"] = mutationId;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("连接超时，请稍后重试");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-json response
  }
  if (!res.ok) {
    const detail = typeof data.error === "object" ? data.error : { message: data.error };
    const error = new Error(detail?.message || `请求失败 (${res.status})`);
    error.code = detail?.code || "REQUEST_FAILED";
    error.requestId = detail?.requestId || data?.meta?.requestId || "";
    throw error;
  }
  return data;
}

async function authedRequest(path, body) {
  return request(path, body, await currentToken());
}

export const health = () => request("/api/health");
export const getConfig = async () => {
  if (configCache) return configCache;
  configCache = await request("/api/config");
  return configCache;
};
export const getState = () => authedRequest("/api/state");

async function getSupabase() {
  if (supabase) return supabase;
  const cfg = await getConfig();
  if (!window.supabase) throw new Error("实时连接不可用");
  supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabase;
}

export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function currentToken() {
  const session = await getSession();
  if (!session?.access_token) throw new Error("请先登录");
  return session.access_token;
}

export async function registerAccount(username, password) {
  return request("/api/auth/register", { username, password });
}

export async function loginByUsername(username, password) {
  return request("/api/auth/login", { username, password });
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch {
    // session may already be gone
  }
}

export const sessionStatus = () => authedRequest("/api/session");

export const register = async (profile) => {
  return authedRequest("/api/register", profile);
};

export const updateProfile = (profile) => authedRequest("/api/profile", profile);
export const postNeed = (need) => authedRequest("/api/need", { need });
export const cancelNeed = () => authedRequest("/api/cancel-need", {});
export const startMatchmaking = (match) => authedRequest("/api/matchmaking/start", { match });
export const getMatchmakingStatus = () => authedRequest("/api/matchmaking/status");
export const cancelMatchmaking = (reason = "user_cancelled") => authedRequest("/api/matchmaking/cancel", { reason });
export const confirmMatchmaking = (pairId, decision) => authedRequest("/api/matchmaking/confirm", { pairId, decision });
export const submitMatchmakingFeedback = (payload) => authedRequest("/api/matchmaking/feedback", payload);
export const goOffline = async () => {
  try {
    await fetch("/api/offline", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentToken()}` },
      body: "{}",
      keepalive: true,
    });
  } catch {
    // best-effort offline signal
  }
};
export const applyTo = (toUserId) => authedRequest("/api/apply", { toUserId });
export const acceptApplication = (applicationId) => authedRequest("/api/accept-application", { applicationId });
export const declineApplication = (applicationId) => authedRequest("/api/decline-application", { applicationId });
export const roomAction = (code, action) => authedRequest(`/api/room/${code}/${action}`, {});
export const roomFeedback = (code, payload) => authedRequest(`/api/room/${code}/feedback`, payload);
export const rematch = (code, choice) => authedRequest(`/api/room/${code}/rematch`, { choice });
export const searchFriend = (code) => authedRequest("/api/friends/search", { code });
export const addFriendByCode = (friendCode) => authedRequest("/api/friends/add", { friendCode });
export const sendFeedback = (payload) => authedRequest("/api/feedback", payload);
export const trackEvent = (eventName, properties = {}) =>
  authedRequest("/api/events", { eventName, properties }).catch(() => null);

export async function getSupabaseClient() {
  return getSupabase();
}

export async function fetchRoomMessages(roomId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function sendRoomMessage(roomId, content, senderId) {
  const sb = await getSupabase();
  const { error } = await sb.from("messages").insert({ room_id: roomId, sender_id: senderId, content });
  if (error) throw error;
}

export function openEvents(handlers) {
  let closeFn = null;
  import("./realtime.js")
    .then(({ openRealtime }) => openRealtime(handlers))
    .then((fn) => {
      closeFn = fn;
    })
    .catch(() => {});
  return () => {
    if (closeFn) closeFn();
  };
}
