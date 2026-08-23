import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const root = process.cwd();

describe("Presence reconnect lifecycle", () => {
  it("defines a forward-only heartbeat and reconnect-grace migration", () => {
    const sql = read(`${root}/supabase/migrations/20260823100000_presence_reconnect_grace.sql`);
    expect(sql).toContain("add column if not exists disconnected_at");
    expect(sql).toContain("create or replace function public.presence_heartbeat");
    expect(sql).toContain("create or replace function public.presence_mark_offline");
    expect(sql).toContain("create or replace function public.presence_reconcile_stale");
    expect(sql).toContain("create or replace function public.phase1_timeout_leave");
    expect(sql).toContain("create or replace function public.presence_guard_matchmaking_ticket");
    expect(sql).toContain("jiyuan-presence-reconcile");
    expect(sql).toContain("'* * * * *'");
    expect(sql).toContain("pg_cron");
    expect(sql).toContain("PRESENCE_CRON_REQUIRED");
    expect(sql).toContain("MATCH_USER_OFFLINE");
    expect(sql).toContain("interval '30 seconds'");
    expect(sql).toContain("interval '180 seconds'");
    expect(sql).toContain("system_timeout_leave");
    expect(sql).toContain("set online = false");
    expect(sql).toContain("presence:reconnect-timeout");
    expect(sql).not.toContain("interval '210 seconds'");
    expect(sql).toContain("coalesce(v_profile.last_seen, v_disconnect_at) <= p_now - interval '180 seconds'");
    expect(sql).not.toContain("session_goodbye_requests");
  });

  it("keeps matching cancellation separate from active Room grace", () => {
    const sql = read(`${root}/supabase/migrations/20260823100000_presence_reconnect_grace.sql`);
    const matchingSection = sql.slice(sql.indexOf("Only pre-room tickets"), sql.indexOf("Mark active Room"));
    expect(matchingSection).toContain("searching");
    expect(matchingSection).toContain("presence_timeout");
    expect(matchingSection).not.toContain("phase1_timeout_leave");
    expect(sql).toContain("disconnected_at = null");
  });

  it("runs a browser heartbeat without binding lifecycle events to Leave", () => {
    const app = read(`${root}/public/js/app.js`);
    expect(app).toContain("presenceHeartbeatHandle");
    expect(app).toContain("window.setInterval(beat, 10_000)");
    expect(app).toContain("startPresenceHeartbeat();");
    expect(app).toMatch(/window\.addEventListener\("pagehide",[\s\S]*Do not call \/api\/offline here/);
    expect(app).not.toMatch(/window\.addEventListener\("pagehide",[\s\S]*?goOffline\(/);
    expect(app).not.toMatch(/window\.addEventListener\("beforeunload",[\s\S]*?goOffline\(/);
  });

  it("makes OPS and public matching use the effective-online cutoff", () => {
    const api = read(`${root}/src/lib/api.ts`);
    const data = read(`${root}/src/lib/data.ts`);
    const health = read(`${root}/src/app/api/health/route.ts`);
    expect(api).toContain('.eq("online", true).gt("last_seen", presenceCutoffIso())');
    expect(data).toContain("isEffectivelyOnline(profile)");
    expect(data).toContain('.eq("online", true).gt("last_seen", presenceCutoffIso())');
    expect(health).toContain("reconcileStalePresence");
  });

  it("does not turn Logout into immediate Room Leave", () => {
    const offline = read(`${root}/src/app/api/offline/route.ts`);
    expect(offline).toContain('rpc("presence_mark_offline"');
    expect(offline).not.toContain('rpc("phase1_exit_room"');
  });
});
