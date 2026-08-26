import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260826140000_matchmaking_fair_scheduler.sql", "utf8");

describe("fair persistent matcher scheduler", () => {
  it("reserves bounded capacity for both fresh and older due tickets", () => {
    expect(service).toContain("const MATCHER_FRESH_BATCH_SIZE = 4;");
    expect(service).toContain("const MATCHER_REGULAR_BATCH_SIZE = 4;");
    expect(service).toContain("matcher_wake_at");
    expect(service).toContain("const rows = [...(freshRows || []), ...(regularRows || [])];");
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

  it("runs only from boot instrumentation, with a jittered recurring tick", () => {
    expect(service).toContain("MATCHER_INTERVAL_MS + Math.floor(Math.random() * MATCHER_INTERVAL_JITTER_MS)");
    expect(service).not.toContain("void runMatchmakingSweep();\n  matcherHandle = setInterval");
  });
});
