import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0006_phase1_mvp_closure.sql", "utf8");

describe("Phase 1 database contract", () => {
  it.each([
    "phase1_accept_application",
    "phase1_start_session",
    "phase1_complete_session",
    "phase1_exit_room",
    "phase1_submit_rematch",
  ])("defines the atomic %s lifecycle function", (name) => {
    expect(sql).toContain(`function public.${name}`);
  });

  it("enables RLS and keeps analytics server-only", () => {
    expect(sql).toContain("alter table public.recent_connections enable row level security");
    expect(sql).toContain("alter table public.product_events enable row level security");
    expect(sql).not.toMatch(/create policy[^;]+product_events/is);
  });

  it("makes session settlement and rematch creation idempotent", () => {
    expect(sql).toContain("recent_connections_session_pair_unique");
    expect(sql).toContain("rooms_rematch_session_unique");
    expect(sql).toContain("sessions_source_session_unique");
  });
});
