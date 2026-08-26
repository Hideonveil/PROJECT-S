#!/usr/bin/env node

// Cancels clearly identified synthetic-test tickets through the same ordinary
// user API as the product. It never deletes or directly updates business rows.
const baseUrl = String(process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const appUrl = String(process.env.CAPACITY_APP_URL || "https://www.jiyuan.online").replace(/\/$/, "");
const args = process.argv.slice(2);
const execute = args.includes("--execute");
const runId = (args.find((value) => value.startsWith("--run-id=")) || "").slice("--run-id=".length);

if (!baseUrl || !serviceRole) throw new Error("SYNTHETIC_RESIDUE: admin environment is unavailable");
if (!runId || process.env.CAPACITY_CLEANUP_APPROVED !== runId) throw new Error("SYNTHETIC_RESIDUE: explicit approval is required");

const activeStates = "searching,candidate_found,waiting_confirmation,matched,playing";
const headers = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` };

async function listUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
    if (!response.ok) throw new Error(`SYNTHETIC_RESIDUE: auth user listing returned HTTP ${response.status}`);
    const body = await response.json();
    users.push(...(body.users || []));
    if ((body.users || []).length < 1000) return users;
  }
}

async function rest(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`SYNTHETIC_RESIDUE: ${path.split("?")[0]} returned HTTP ${response.status}`);
  return response.json();
}

function chunks(values, size = 80) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function isSynthetic(user) {
  const metadata = user?.user_metadata || {};
  return metadata.account_type === "synthetic_test" || metadata.purpose === "capacity" || metadata.capacity_run_id === "capstate500-0824";
}

async function ordinaryCancel(user, ordinal) {
  const password = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const update = await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}`, {
    method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!update.ok) throw new Error("credential preparation failed");
  const signIn = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: serviceRole, "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password }),
  });
  if (!signIn.ok) throw new Error("ordinary sign-in failed");
  const session = await signIn.json();
  const sessionHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
  const stateResponse = await fetch(`${appUrl}/api/state`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const state = stateResponse.ok ? await stateResponse.json() : null;
  const roomCode = state?.room?.code || null;
  const endpoint = roomCode ? `/api/room/${encodeURIComponent(roomCode)}/exit` : "/api/matchmaking/cancel";
  const body = roomCode ? {} : { reason: "synthetic_historical_residue_cleanup" };
  const cancel = await fetch(`${appUrl}${endpoint}`, {
    method: "POST",
    headers: { ...sessionHeaders, "x-idempotency-key": `${runId}-${ordinal}` },
    body: JSON.stringify(body),
  });
  if (!cancel.ok) throw new Error(`normal cancel returned HTTP ${cancel.status}`);
}

const users = (await listUsers()).filter(isSynthetic);
const profiles = [];
for (const group of chunks(users.map((user) => user.id))) {
  profiles.push(...await rest(`profiles?select=id,auth_user_id&auth_user_id=in.(${group.join(",")})`));
}
const authByProfile = new Map(profiles.map((profile) => [profile.id, profile.auth_user_id]));
const tickets = [];
for (const group of chunks(profiles.map((profile) => profile.id))) {
  tickets.push(...await rest(`matchmaking_tickets?select=id,user_id,state&state=in.(${activeStates})&user_id=in.(${group.join(",")})`));
}
const targetUsers = [...new Set(tickets.map((ticket) => authByProfile.get(ticket.user_id)).filter(Boolean))];
const byAuthId = new Map(users.map((user) => [user.id, user]));

if (!execute) {
  console.log(JSON.stringify({ run_id: runId, synthetic_active_tickets: tickets.length, synthetic_actors: targetUsers.length, mode: "dry_run" }));
  process.exit(0);
}

let cancelled = 0;
let failed = 0;
for (const [index, authUserId] of targetUsers.entries()) {
  try {
    await ordinaryCancel(byAuthId.get(authUserId), index + 1);
    cancelled += 1;
  } catch {
    failed += 1;
  }
}
console.log(JSON.stringify({ run_id: runId, synthetic_active_tickets_before: tickets.length, actors_cancelled_by_normal_api: cancelled, failed, credentials: "not logged or persisted" }));
