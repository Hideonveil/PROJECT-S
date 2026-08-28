import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0009_realtime_matchmaking.sql", "utf8");
const rankedMatcher = readFileSync("src/lib/matchmaking/ranked.ts", "utf8");

describe("realtime matchmaking database contract", () => {
  it.each([
    "matchmaking_start_ticket",
    "matchmaking_heartbeat",
    "matchmaking_reserve_pair",
    "matchmaking_present_pair",
    "matchmaking_cancel_ticket",
    "matchmaking_confirm_pair",
    "matchmaking_expire_stale",
    "matchmaking_submit_feedback",
    "matchmaking_sync_session_lifecycle",
  ])("defines transactional %s", (name) => {
    expect(sql).toContain(`function public.${name}`);
  });

  it("prevents duplicate active tickets and locks pair reservations", () => {
    expect(sql).toContain("matchmaking_one_active_ticket_per_user");
    expect(sql).toMatch(/where id in \(p_ticket_a,p_ticket_b\) order by id for update/i);
    expect(sql).toContain("MATCH_RESERVATION_CONFLICT");
  });

  it("records every lifecycle transition and synchronizes Session state", () => {
    expect(sql).toContain("matchmaking_state_events");
    expect(sql).toContain("matchmaking_session_lifecycle_trigger");
    expect(sql).toContain("after update of status on public.sessions");
  });

  it("keeps rules versioned instead of embedding score weights", () => {
    expect(sql).toContain("matchmaking_rule_sets");
    expect(sql).toContain("soft_preferences");
    expect(sql).toContain("maxRankDistance");
    expect(sql).not.toMatch(/match_score|weighted_score/i);
  });

  it("keeps writes behind service-role RPCs and publishes live state", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("supabase_realtime add table public.matchmaking_tickets");
    expect(sql).toContain("supabase_realtime add table public.matchmaking_pairs");
  });

  it("lets players meet again after a connection timeout while respecting explicit rejection", () => {
    expect(rankedMatcher).toContain('.eq("cancel_reason", "rejected")');
    expect(rankedMatcher).not.toContain('.in("cancel_reason", ["rejected", "confirmation_timeout"])');
  });
});
