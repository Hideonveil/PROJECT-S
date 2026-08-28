import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync("src/lib/matchmaking/runtime-telemetry.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260825210000_matchmaking_conflict_contract_and_telemetry.sql",
  "utf8",
);
const idempotencyMigration = readFileSync(
  "supabase/migrations/20260825224500_matchmaking_group_member_idempotency.sql",
  "utf8",
);

describe("persistent matchmaking runtime contract", () => {
  it("returns typed group contention without using SQLSTATE 40001", () => {
    expect(migration).toContain("classification', 'MATCHING_BUSINESS_CONFLICT'");
    expect(migration).toContain("'reason', 'STALE_CANDIDATE'");
    expect(migration).toContain("'reason', 'GROUP_FULL'");
    expect(migration).toContain("'reason', 'ROOM_LOCKED'");
    expect(migration).not.toMatch(/raise exception using errcode\s*=\s*'40001'/);
  });

  it("uses durable eligibility state and a cross-process lease", () => {
    expect(migration).toContain("next_match_attempt_at");
    expect(migration).toContain("matchmaking_claim_matcher_lease");
  });

  it("keeps database failures distinct from expected business contention", () => {
    expect(telemetry).toContain("MATCHER_RUNTIME_COUNTERS");
    expect(telemetry).toContain("matchmaking_flush_runtime");
  });

  it("normalizes a stale same-user group membership before ticket upsert", () => {
    expect(idempotencyMigration).toContain("group_id = v_group.id");
    expect(idempotencyMigration).toContain("user_id = v_ticket.user_id");
    expect(idempotencyMigration).toContain("ticket_id <> v_ticket.id");
    expect(idempotencyMigration).toContain("on conflict (ticket_id) do update");
    expect(idempotencyMigration).not.toMatch(/raise exception using errcode\s*=\s*'23505'/);
  });

  it("records instance, event, and minute-level metrics without secrets", () => {
    expect(migration).toContain("matchmaking_runtime_instances");
    expect(migration).toContain("matchmaking_runtime_minute");
    expect(migration).toContain("matchmaking_runtime_events");
    expect(telemetry).toContain("eventLimitPerMinute");
    expect(telemetry).not.toContain("Authorization");
    expect(telemetry).not.toContain("refresh_token");
    expect(telemetry).not.toContain("service_role");
  });
});
