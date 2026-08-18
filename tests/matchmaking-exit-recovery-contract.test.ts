import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0010_matchmaking_exit_recovery.sql", "utf8");

describe("matchmaking room exit recovery contract", () => {
  it("closes a ready Session when either participant exits", () => {
    expect(sql).toContain("create or replace function public.phase1_exit_room");
    expect(sql).toContain("if v_session.status = 'ready'");
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("completion_reason = 'member_exited'");
  });

  it("finalizes a playing Session and lets lifecycle triggers release tickets", () => {
    expect(sql).toContain("elsif v_session.status = 'playing'");
    expect(sql).toContain("public.phase1_finalize_session");
  });

  it("repairs only orphaned active matchmaking state without deleting history", () => {
    expect(sql).toContain("update public.matchmaking_pairs");
    expect(sql).toContain("update public.matchmaking_tickets");
    expect(sql).not.toMatch(/delete\s+from/i);
  });
});
