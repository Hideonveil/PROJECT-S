import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("explicit-exit lifecycle", () => {
  it("disables heartbeat and stale maintenance RPCs without removing compatibility shims", () => {
    const migration = read("supabase/migrations/20260822170000_explicit_exit_lifecycle.sql");
    expect(migration).toContain("select 0;");
    expect(migration).toContain("force_explicit_matchmaking_lifecycle");
    expect(migration).toContain("'infinity'::timestamptz");
    expect(migration).toContain("heartbeatDisabled");
  });

  it("keeps matchmaking reads and the matching page free of heartbeat writes", () => {
    const service = read("src/lib/matchmaking/service.ts");
    const app = read("public/js/app.js");
    expect(service).not.toContain('rpc("matchmaking_heartbeat"');
    expect(service).not.toContain('rpc("matchmaking_expire_stale"');
    expect(service).not.toContain('rpc("matchmaking_expire_group_stale"');
    expect(app).not.toContain("presenceHeartbeatTimer");
    expect(app).toContain("shared reconnect path in realtime.js");
  });

  it("keeps transient offline separate from explicit Leave", () => {
    const route = read("src/app/api/offline/route.ts");
    const app = read("public/js/app.js");
    const api = read("public/js/api.js");
    expect(route).toContain('body?.reason !== "explicit_logout"');
    expect(route).toContain('rpc("presence_mark_offline"');
    expect(route).not.toContain('rpc("phase1_exit_room"');
    expect(route).not.toContain('from("room_members")');
    expect(app).not.toMatch(/window\.addEventListener\("pagehide",[\s\S]*?markPresenceOffline\(\)/);
    expect(app).not.toMatch(/window\.addEventListener\("beforeunload",[\s\S]*?markPresenceOffline\(\)/);
    expect(api).toContain('reason = "explicit_logout"');
  });
});
