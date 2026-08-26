#!/usr/bin/env node

// Small, credential-safe smoke test: five ordinary synthetic users exercise
// login, presence, Room-first matching, state hydration, and normal exit.
import { readFile } from "node:fs/promises";

const authFile = process.argv.find((arg) => arg.startsWith("--auth-file="))?.slice(12);
const envFile = process.argv.find((arg) => arg.startsWith("--env-file="))?.slice(11);
if (!authFile || !envFile) throw new Error("SMOKE: --auth-file and --env-file are required");

const env = Object.fromEntries((await readFile(envFile, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
}));
const baseUrl = "https://www.jiyuan.online";
const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const apiKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
if (!supabaseUrl || !apiKey) throw new Error("SMOKE: public auth configuration unavailable");
const identities = (JSON.parse(await readFile(authFile, "utf8")).identities || []).slice(0, 5);
if (identities.length !== 5) throw new Error("SMOKE: five identities required");

function signal() { return AbortSignal.timeout(12_000); }
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: signal() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(body?.error?.code || body?.code || `HTTP_${response.status}`).replace(/[^A-Z0-9_]/g, "_");
    throw new Error(code);
  }
  return body;
}
async function login(identity) {
  const session = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: identity.identifier, password: identity.password }),
  });
  return { identity: identity.identity, token: session.access_token };
}
function headers(actor) { return { Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json" }; }
async function call(actor, path, body = undefined) {
  return json(`${baseUrl}${path}`, { method: body === undefined ? "GET" : "POST", headers: headers(actor), body: body === undefined ? undefined : JSON.stringify(body) });
}
const ranked = { gameId: "deadlock", mode: "ranked", rankCode: "oracle", desiredRoles: [], ownRoles: [], teammateRoles: [], microphonePreference: "any" };
const casual = { gameId: "deadlock", mode: "casual", desiredRoles: [], ownRoles: [], teammateRoles: [], microphonePreference: "any", desiredTeammates: 2, minTeammates: 2 };
const report = { authenticated: 0, presence: 0, room_shells: 0, ranked_room_members: 0, casual_room_members: 0, errors: [] };
const actors = [];
try {
  for (const identity of identities) { actors.push(await login(identity)); report.authenticated += 1; }
  for (const actor of actors) { await call(actor, "/api/online", {}); report.presence += 1; }
  for (const [index, actor] of actors.entries()) {
    const started = await call(actor, "/api/matchmaking/start", { match: index < 2 ? ranked : casual });
    if (started.room?.code) report.room_shells += 1;
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const states = await Promise.all(actors.map((actor) => call(actor, "/api/state")));
    report.ranked_room_members = states.slice(0, 2).filter((state) => state.room?.members?.length >= 2).length;
    report.casual_room_members = states.slice(2).filter((state) => state.room?.members?.length >= 3).length;
    if (report.ranked_room_members === 2 && report.casual_room_members === 3) break;
  }
} catch (error) {
  report.errors.push(String(error?.message || "UNKNOWN").replace(/Bearer\s+\S+/gi, "REDACTED"));
} finally {
  for (const actor of actors) {
    try {
      const state = await call(actor, "/api/state");
      if (state.room?.code) await call(actor, `/api/room/${encodeURIComponent(state.room.code)}/exit`, {});
      else await call(actor, "/api/matchmaking/cancel", { reason: "quick_five_smoke_cleanup" });
    } catch { /* lifecycle cleanup is best-effort; separate audit follows */ }
  }
}
console.log(JSON.stringify(report));
