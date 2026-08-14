let supabase = null;
let authToken = null;
let configCache = null;

async function request(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-json response
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export const health = () => request("/api/health");
export const getConfig = async () => {
  if (configCache) return configCache;
  configCache = await request("/api/config");
  return configCache;
};
export const getState = (token) => request(`/api/state?token=${encodeURIComponent(token)}`);

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
  authToken = session.access_token;
  return authToken;
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

export const sessionStatus = (token) => request(`/api/session?token=${encodeURIComponent(token)}`);

export const register = async (profile) => {
  const token = await currentToken();
  return request("/api/register", { ...profile, token });
};

export const updateProfile = (token, profile) => request("/api/profile", { token, ...profile });
export const postNeed = (token, need) => request("/api/need", { token, need });
export const cancelNeed = (token) => request("/api/cancel-need", { token });
export const goOffline = (token) => {
  try {
    navigator.sendBeacon("/api/offline", new Blob([JSON.stringify({ token })], { type: "application/json" }));
  } catch {
    // best-effort offline signal
  }
};
export const applyTo = (token, toUserId) => request("/api/apply", { token, toUserId });
export const acceptApplication = (token, applicationId) => request("/api/accept-application", { token, applicationId });
export const declineApplication = (token, applicationId) => request("/api/decline-application", { token, applicationId });
export const roomAction = (code, action, token) => request(`/api/room/${code}/${action}`, { token });
export const rematch = (code, choice, token) => request(`/api/room/${code}/rematch`, { token, choice });
export const searchFriend = (token, code) => request("/api/friends/search", { token, code });
export const addFriendByCode = (token, friendCode) => request("/api/friends/add", { token, friendCode });
export const sendFeedback = (token, payload) => request("/api/feedback", { token, ...payload });

export function openEvents(token, handlers) {
  let closeFn = null;
  import("./realtime.js")
    .then(({ openRealtime }) => openRealtime(token, handlers))
    .then((fn) => {
      closeFn = fn;
    })
    .catch(() => {});
  return () => {
    if (closeFn) closeFn();
  };
}