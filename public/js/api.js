let supabase = null;
let configCache = null;
let cachedAccessToken = "";

async function request(path, body, token = null, { timeoutMs = 15000 } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    const mutationId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    headers["X-Request-ID"] = mutationId;
    headers["Idempotency-Key"] = mutationId;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
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
    if (error?.name === "AbortError") {
      const timeoutError = new Error("连接超时，正在核对服务器状态");
      timeoutError.code = "CONNECTION_TIMEOUT";
      throw timeoutError;
    }
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
  // Cache as soon as a persisted login is restored so the next authenticated
  // state request can reuse the session without another auth round trip.
  cachedAccessToken = data.session?.access_token || "";
  return data.session;
}

export async function currentToken() {
  const session = await getSession();
  if (!session?.access_token) throw new Error("请先登录");
  cachedAccessToken = session.access_token;
  return session.access_token;
}

export async function registerAccount(username, email, password) {
  return request("/api/auth/register", { username, email, password });
}

export async function loginByIdentifier(identifier, password) {
  return request("/api/auth/login", { identifier, password });
}

export const loginByUsername = loginByIdentifier;

export async function resendVerification(email) {
  return request("/api/auth/resend", { email });
}

export async function requestPasswordReset(email) {
  return request("/api/auth/forgot", { email });
}

export async function updatePassword(password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function verifySignupOtp(email, token) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  cachedAccessToken = data.session?.access_token || "";
  return data;
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  cachedAccessToken = data.session?.access_token || "";
  return data;
}

export async function signOut() {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch {
    // session may already be gone
  } finally {
    cachedAccessToken = "";
  }
}

export const sessionStatus = () => authedRequest("/api/session");

export const register = async (profile) => {
  return authedRequest("/api/register", profile);
};

export const updateProfile = (profile) => authedRequest("/api/profile", profile);
export const startMatchmaking = async (match) => request("/api/matchmaking/start", { match }, await currentToken(), { timeoutMs: 30000 });
export const joinMatchmaking = async (ticketId) => request("/api/matchmaking/join", { ticketId }, await currentToken(), { timeoutMs: 30000 });
export const getMatchmakingStatus = async () => request(
  "/api/matchmaking/status",
  undefined,
  cachedAccessToken || await currentToken(),
  { timeoutMs: 30000 }
);
export const cancelMatchmaking = async (reason = "user_cancelled") => request("/api/matchmaking/cancel", { reason }, await currentToken(), { timeoutMs: 30000 });
export const confirmMatchmaking = async (pairId, decision) => request("/api/matchmaking/confirm", { pairId, decision }, await currentToken(), { timeoutMs: 30000 });
export const startMatchGroup = async (groupId) => request("/api/matchmaking/group/start", { groupId }, await currentToken(), { timeoutMs: 30000 });
export const confirmMatchGroup = async (groupId, decision) => request("/api/matchmaking/confirm", { groupId, decision }, await currentToken(), { timeoutMs: 30000 });
export const submitMatchmakingFeedback = (payload) => authedRequest("/api/matchmaking/feedback", payload);
export const goOffline = async ({ reason = "explicit_logout" } = {}) => {
  try {
    // This is deliberately an ordinary authenticated request. Browser
    // lifecycle events never call it; only explicit logout does.
    const token = cachedAccessToken || await currentToken();
    if (!token) return;
    await fetch("/api/offline", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
      keepalive: true,
    });
  } catch {
    // Presence is deliberately best-effort: closing a tab must never block it.
  }
};
export const goOnline = () => authedRequest("/api/online", {});
export const roomAction = (code, action) => authedRequest(`/api/room/${code}/${action}`, {});
export const requestRoomGoodbye = (code, requested) => authedRequest(`/api/room/${code}/goodbye`, { requested });
export const roomFeedback = (code, payload) => authedRequest(`/api/room/${code}/feedback`, payload);
export const searchFriend = (code) => authedRequest("/api/friends/search", { code });
export const addFriend = ({ friendCode, targetUserId } = {}) => authedRequest("/api/friends/add", { friendCode, targetUserId });
export const respondFriend = (requesterId, decision) => authedRequest("/api/friends/respond", { requesterId, decision });
export const sendFeedback = async (payload) => request("/api/feedback", payload, await currentToken());
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
  let closed = false;
  import("./realtime.js")
    .then(({ openRealtime }) => {
      if (closed) return null;
      return openRealtime(handlers);
    })
    .then((fn) => {
      if (!fn) return;
      if (closed) {
        fn();
        return;
      }
      closeFn = fn;
    })
    .catch(() => {});
  return () => {
    closed = true;
    if (closeFn) closeFn();
    closeFn = null;
  };
}
