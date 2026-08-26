#!/usr/bin/env node

// Internal capacity-account inspection. This tool deliberately returns only
// aggregate counts and metadata keys; credentials and personal identifiers are
// never printed or written.
const baseUrl = String(process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const args = process.argv.slice(2);

process.on("uncaughtException", (error) => {
  console.error(`CAPACITY_POOL_ERROR: ${String(error?.message || "unknown")}`);
  process.exit(1);
});

if (!baseUrl || !serviceRole) throw new Error("CAPACITY_POOL: Supabase admin environment is unavailable");

async function listUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    });
    if (!response.ok) throw new Error(`CAPACITY_POOL: list users returned HTTP ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body.users) ? body.users : [];
    users.push(...rows);
    if (rows.length < 1000) return users;
  }
}

async function rest(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
  if (!response.ok) throw new Error(`CAPACITY_POOL: ${path.split("?")[0]} returned HTTP ${response.status}`);
  return response.json();
}

function chunks(values, size = 80) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
}

async function selectIdleCapacityUsers(users) {
  const candidates = users
    .filter((user) => user?.user_metadata?.capacity_run_id === "capstate500-0824" && user.email_confirmed_at)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const profiles = [];
  for (const group of chunks(candidates.map((user) => user.id))) {
    profiles.push(...await rest(`profiles?select=id,auth_user_id&auth_user_id=${encodeURIComponent(inFilter(group))}`));
  }
  const profileByAuthId = new Map(profiles.map((profile) => [profile.auth_user_id, profile.id]));
  const activeProfileIds = new Set();
  for (const group of chunks(profiles.map((profile) => profile.id))) {
    const [tickets, members] = await Promise.all([
      rest(`matchmaking_tickets?select=user_id&state=${encodeURIComponent("in.(searching,candidate_found,waiting_confirmation,matched,playing)")}&user_id=${encodeURIComponent(inFilter(group))}`),
      rest(`room_members?select=user_id&status=eq.active&user_id=${encodeURIComponent(inFilter(group))}`),
    ]);
    for (const row of [...tickets, ...members]) activeProfileIds.add(row.user_id);
  }
  return candidates.filter((user) => {
    const profileId = profileByAuthId.get(user.id);
    return profileId && !activeProfileIds.has(profileId);
  });
}

function option(prefix) {
  const found = args.find((value) => value.startsWith(`${prefix}=`));
  return found ? found.slice(prefix.length + 1) : "";
}

async function prepareStatefulCredentials(users) {
  const count = Number(option("--prepare-stateful"));
  const runId = option("--run-id");
  const output = option("--output");
  if (!Number.isInteger(count) || count < 5 || count > 500 || !runId || !output) {
    throw new Error("CAPACITY_POOL: --prepare-stateful=<5..500>, --run-id and --output are required");
  }
  if (process.env.CAPACITY_PROVISION_APPROVED !== runId) {
    throw new Error("CAPACITY_POOL: CAPACITY_PROVISION_APPROVED must equal --run-id");
  }
  const idle = await selectIdleCapacityUsers(users);
  if (idle.length < count) throw new Error(`CAPACITY_POOL: only ${idle.length} idle synthetic accounts are available`);
  const selected = idle.slice(0, count);
  const identities = [];
  for (const [index, user] of selected.entries()) {
    const password = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const response = await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!response.ok) throw new Error(`CAPACITY_POOL: synthetic credential preparation failed at slot ${index + 1}`);
    if (index === 0) {
      const verification = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: serviceRole, "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      });
      if (!verification.ok) throw new Error(`CAPACITY_POOL: first prepared account ordinary password sign-in returned HTTP ${verification.status}`);
    }
    identities.push({ identity: `BP${String(index + 26).padStart(3, "0")}`, identifier: user.email, password });
  }
  const { writeFile, chmod } = await import("node:fs/promises");
  await writeFile(output, `${JSON.stringify({ identities })}\n`, { mode: 0o600 });
  await chmod(output, 0o600);
  console.log(JSON.stringify({ run_id: runId, prepared_synthetic_accounts: identities.length, source_pool: "capstate500-0824", first_ordinary_auth_verified: true, credentials_written: "0600 temporary file" }));
}

function isSyntheticCapacityUser(user) {
  const metadata = user?.user_metadata || {};
  return metadata.account_type === "synthetic_test"
    || metadata.purpose === "capacity"
    || /^cap(?:state|acity|[_-])/i.test(String(user?.email || ""));
}

const users = await listUsers();
if (args.some((value) => value.startsWith("--prepare-stateful="))) {
  await prepareStatefulCredentials(users);
  process.exit(0);
}
const synthetic = users.filter(isSyntheticCapacityUser);
const metadataKeys = {};
const capacityRuns = {};
for (const user of synthetic) {
  for (const key of Object.keys(user.user_metadata || {})) metadataKeys[key] = (metadataKeys[key] || 0) + 1;
  const run = String(user.user_metadata?.capacity_run_id || "UNMARKED");
  capacityRuns[run] = (capacityRuns[run] || 0) + 1;
}

console.log(JSON.stringify({
  total_users: users.length,
  synthetic_capacity_candidates: synthetic.length,
  email_confirmed: synthetic.filter((user) => Boolean(user.email_confirmed_at)).length,
  metadata_keys: metadataKeys,
  capacity_run_ids: capacityRuns,
}, null, 2));
