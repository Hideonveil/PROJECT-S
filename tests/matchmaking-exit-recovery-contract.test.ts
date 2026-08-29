import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0011_normal_and_abnormal_session_end.sql", "utf8");
const securitySql = readFileSync("supabase/migrations/0012_restrict_internal_matchmaking_functions.sql", "utf8");
const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
const orphanSql = readFileSync("supabase/migrations/20260828230000_reconcile_orphan_waiting_rooms.sql", "utf8");

describe("matchmaking room exit recovery contract", () => {
  it("reconciles only unbacked pre-session memberships after cancellation", () => {
    expect(orphanSql).toContain("reconcile_orphan_waiting_rooms");
    expect(orphanSql).toContain("not exists");
    expect(orphanSql).toContain("room_members");
    expect(orphanSql).toContain("matchmaking_tickets");
    expect(orphanSql).toContain("sessions");
    expect(service).toContain("reconcileOrphanWaitingRooms");
  });
  it("treats cancellation after lifecycle convergence as an idempotent success", () => {
    expect(service).toContain("if (!active) return inactiveTicketSnapshot(reason);");
    expect(service).toContain("alreadyInactive: true");
  });
  it("closes a ready Session when either participant exits", () => {
    expect(sql).toContain("create or replace function public.phase1_exit_room");
    expect(sql).toContain("if v_session.status in ('ready', 'playing')");
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("completion_reason = 'member_exited'");
  });

  it("does not count an explicit playing-room exit as a completed game", () => {
    expect(sql).not.toContain("public.phase1_finalize_session");
    expect(sql).not.toContain("recent_connections");
  });

  it("adds an independent like response without exposing the function publicly", () => {
    expect(sql).toContain("add column if not exists liked boolean");
    expect(sql).toContain("revoke all on function public.phase1_exit_room");
    expect(sql).toContain("grant execute on function public.phase1_exit_room");
  });
});

describe("internal matchmaking function permissions", () => {
  it("keeps transition logging and trigger synchronization off the public API", () => {
    expect(securitySql).toContain("revoke all on function public.matchmaking_log_transition");
    expect(securitySql).toContain("revoke all on function public.matchmaking_sync_session_lifecycle()");
    expect(securitySql).toContain("from public, anon, authenticated");
  });
});
