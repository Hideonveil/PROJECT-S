import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260821170000_reconcile_ghost_matchmaking.sql",
  "utf8",
);
const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");
const app = readFileSync("public/js/app.js", "utf8");
const lifecycleMigration = readFileSync(
  "supabase/migrations/20260821190000_close_group_tickets_on_session_end.sql",
  "utf8",
);

describe("ghost matchmaking recovery", () => {
  it("reconciles tickets when a pair or group becomes terminal", () => {
    expect(sql).toContain("matchmaking_reconcile_terminal_pair_tickets");
    expect(sql).toContain("matchmaking_pair_terminal_ticket_reconcile");
    expect(sql).toContain("matchmaking_reconcile_terminal_group_tickets");
    expect(sql).toContain("matchmaking_group_terminal_ticket_reconcile");
    expect(sql).toContain("where pair_id = new.id");
    expect(sql).toContain("where group_id = new.id");
  });

  it("repairs expired and terminal-reference tickets", () => {
    expect(sql).toContain("t.expires_at <= now()");
    expect(sql).toContain("p.state in ('cancelled', 'expired', 'completed')");
    expect(sql).toContain("select public.matchmaking_expire_stale();");
  });

  it("does not treat an expired pre-room ticket as active", () => {
    expect(service).toContain("ticket.expires_at");
    expect(service).toContain("waiting_confirmation");
    expect(api).toContain('.in("state", ["searching", "candidate_found", "waiting_confirmation"])');
    expect(api).not.toContain('.gt("expires_at", activeTicketCutoff)');
  });

  it("keeps a terminal pair out of the matching UI", () => {
    expect(app).toContain("isLiveMatchmakingSnapshot");
    expect(app).toContain('"匹配状态已结束，请重新开始。"');
    expect(app).toContain('navigate("#/home")');
  });

  it("closes casual groups and their tickets when the linked Session ends", () => {
    expect(lifecycleMigration).toContain("create or replace function public.matchmaking_sync_session_lifecycle()");
    expect(lifecycleMigration).toContain("update public.matchmaking_groups");
    expect(lifecycleMigration).toContain("where session_id = new.id");
    expect(lifecycleMigration).toContain("where group_id in (select id from public.matchmaking_groups where session_id = new.id)");
    expect(lifecycleMigration).toContain("Repair group/ticket rows left behind");
  });

  it("resolves the active Session from the newest live room", () => {
    expect(api).toContain('.in("status", ["connecting", "ready", "playing"])');
    expect(api).toContain("const roomId = rooms?.[0]?.id;");
    expect(api).toContain('.eq("room_id", roomId)');
  });

  it("does not restore a room whose latest Session is terminal", () => {
    expect(api).toContain("latestSessionByRoom");
    expect(api).toContain('["ready", "playing"].includes(latest.status)');
    expect(api).toContain("otherwise a refresh can");
    expect(api).toContain("reopen the previous room");
  });
});
