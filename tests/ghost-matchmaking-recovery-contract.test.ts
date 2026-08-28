import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260821170000_reconcile_ghost_matchmaking.sql",
  "utf8",
);
const ticketStore = readFileSync("src/lib/matchmaking/ticket-store.ts", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");
const roomReadModel = readFileSync("src/lib/room-read-model.ts", "utf8");
const app = readFileSync("public/js/app.js", "utf8");
const matchmakingSnapshot = readFileSync("public/js/matchmaking-snapshot.js", "utf8");
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
    expect(ticketStore).toContain("expires_at is intentionally ignored");
    expect(ticketStore).toContain("waiting_confirmation");
    expect(api).toContain('.in("state", ["searching", "candidate_found", "waiting_confirmation"])');
    expect(api).not.toContain('.gt("expires_at", activeTicketCutoff)');
  });

  it("keeps a terminal pair out of the matching UI", () => {
    expect(app).toContain("isLiveMatchmakingSnapshot");
    expect(matchmakingSnapshot).toContain('"匹配状态已结束，请重新开始。"');
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
    expect(roomReadModel).toContain('.in("status", ["connecting", "ready", "playing"])');
    expect(roomReadModel).toContain("loadActiveRoomCandidate");
    expect(roomReadModel).toContain('.select("*")');
    expect(api).toContain("return candidate.session as Session;");
  });

  it("does not restore a room whose latest Session is terminal", () => {
    expect(roomReadModel).toContain("latestSessionByRoom");
    expect(roomReadModel).toContain('sessionStatus === "ready" || sessionStatus === "playing"');
    expect(roomReadModel).toContain("otherwise a refresh can");
    expect(roomReadModel).toContain("reopen the previous room");
  });
});
