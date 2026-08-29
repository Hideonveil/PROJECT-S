#!/usr/bin/env node

// Small, credential-safe smoke test: five ordinary synthetic users exercise
// login, presence, Room-first matching, state hydration, and normal exit.
import { readFile } from "node:fs/promises";
import { buildCapacityMatchInput, loadCapacityGame } from "./game-catalog.mjs";

const authFile = process.argv.find((arg) => arg.startsWith("--auth-file="))?.slice(12);
if (!authFile) throw new Error("SMOKE: --auth-file is required");

const baseUrl = "https://www.jiyuan.online";
const smokeInstance = `quick-five:${crypto.randomUUID()}`;
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
  const clientInstanceId = `${smokeInstance}:${identity.identity}`;
  const loginResult = await json(new URL("/api/auth/login", baseUrl), {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Instance-ID": clientInstanceId },
    body: JSON.stringify({ identifier: identity.identifier, password: identity.password }),
  });
  if (!loginResult?.session?.access_token) throw new Error("AUTH_SESSION_MISSING");
  return { identity: identity.identity, token: loginResult.session.access_token, clientInstanceId };
}
function headers(actor) {
  return { Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json", "X-Client-Instance-ID": actor.clientInstanceId };
}
async function call(actor, path, body = undefined) {
  return json(`${baseUrl}${path}`, { method: body === undefined ? "GET" : "POST", headers: headers(actor), body: body === undefined ? undefined : JSON.stringify(body) });
}
const game = await loadCapacityGame(baseUrl);
const ranked = buildCapacityMatchInput({ role: "ranked", match: {} }, game);
const casual = buildCapacityMatchInput({ role: "casual", match: { preferredTotalPlayers: 3 } }, game);
const report = {
  authenticated: 0,
  presence: 0,
  room_shells: 0,
  ranked_room_members: 0,
  casual_room_members: 0,
  casual_member_counts: [],
  cleanup_errors: [],
  errors: [],
};
const actors = [];
let latestStates = [];
try {
  for (const identity of identities) { actors.push(await login(identity)); report.authenticated += 1; }
  for (const actor of actors) { await call(actor, "/api/online", {}); report.presence += 1; }
  for (const [index, actor] of actors.entries()) {
    const started = await call(actor, "/api/matchmaking/start", { match: index < 2 ? ranked : casual });
    if (started.room?.code) report.room_shells += 1;
  }
  // The persistent matcher has a 15s safety sweep. Allow two full sweeps so
  // a coalesced event wake at the edge of a cooldown is not misreported as a
  // product failure by this small smoke test.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const states = await Promise.all(actors.map((actor) => call(actor, "/api/state")));
    latestStates = states;
    report.ranked_room_members = states.slice(0, 2).filter((state) => state.room?.members?.length >= 2).length;
    report.casual_room_members = states.slice(2).filter((state) => state.room?.members?.length >= 3).length;
    if (report.ranked_room_members === 2 && report.casual_room_members === 3) break;
  }
} catch (error) {
  report.errors.push(String(error?.message || "UNKNOWN").replace(/Bearer\s+\S+/gi, "REDACTED"));
} finally {
  report.casual_member_counts = latestStates.slice(2).map((state) => Number(state.room?.members?.length || 0));
  for (const [index, actor] of actors.entries()) {
    let stateBefore = null;
    try {
      stateBefore = await call(actor, "/api/state");
      if (stateBefore.room?.code) await call(actor, `/api/room/${encodeURIComponent(stateBefore.room.code)}/exit`, {});
      else await call(actor, "/api/matchmaking/cancel", { reason: "quick_five_smoke_cleanup" });
    } catch (error) {
      const stateAfter = await call(actor, "/api/state").catch(() => null);
      report.cleanup_errors.push({
        slot: index + 1,
        code: String(error?.message || "UNKNOWN").replace(/[^A-Z0-9_]/g, "_"),
        hadRoom: Boolean(stateBefore?.room?.code),
        roomAfter: Boolean(stateAfter?.room?.code),
        ticketAfter: stateAfter?.matchmaking?.ticket?.state || null,
      });
    }
  }
}
console.log(JSON.stringify(report));
