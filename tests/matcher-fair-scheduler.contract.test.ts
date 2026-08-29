import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATCHER_SCHEDULER_POLICY } from "../src/lib/matchmaking/scheduler";

const migration = readFileSync("supabase/migrations/20260826140000_matchmaking_fair_scheduler.sql", "utf8");

describe("fair persistent matcher scheduler", () => {
  it("reserves bounded capacity for both fresh and older due tickets", () => {
    expect(MATCHER_SCHEDULER_POLICY.freshBatchSize).toBe(16);
    expect(MATCHER_SCHEDULER_POLICY.regularBatchSize).toBe(4);
  });

  it("drains burst tickets with small bounded concurrency", () => {
    expect(MATCHER_SCHEDULER_POLICY.processingConcurrency).toBe(2);
  });

  it("keeps ticket wakes durable and separate from ordinary telemetry updates", () => {
    expect(migration).toContain("add column if not exists matcher_wake_at timestamptz null");
    expect(migration).toContain("new.matcher_wake_at := now();");
    expect(migration).toContain("consecutive_match_errors");
    expect(migration).toContain("matcher_quarantined_at");
  });

  it("does not leave the trigger helper callable from public roles", () => {
    expect(migration).toContain("revoke all on function public.matchmaking_wake_search_ticket() from public, anon, authenticated;");
  });

  it("attaches durable wake-up behavior to ticket writes", () => {
    expect(migration).toContain("create trigger matchmaking_wake_search_ticket_trigger");
    expect(migration).toContain("before insert or update of state, group_id, pair_id on public.matchmaking_tickets");
    expect(migration).toContain("execute function public.matchmaking_wake_search_ticket();");
  });

  it("runs only from boot instrumentation, with event wake and a jittered safety sweep", () => {
    expect(MATCHER_SCHEDULER_POLICY.eventCoalesceMs).toBe(100);
    expect(MATCHER_SCHEDULER_POLICY.safetySweepMs).toBe(15_000);
    expect(MATCHER_SCHEDULER_POLICY.safetySweepJitterMs).toBe(2_000);
  });
});
