import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825130000_return_reservation_conflicts.sql",
  "utf8",
);

describe("reservation conflict RPC contract", () => {
  it("returns expected pair contention as a committed result", () => {
    expect(migration).toContain("returns jsonb language plpgsql security definer");
    expect(migration).toContain("'reason', 'MATCH_RESERVATION_CONFLICT'");
    expect(migration).toContain("'retryable', true");
    expect(migration).not.toMatch(/raise exception using errcode='40001',message='MATCH_RESERVATION_CONFLICT'/);
  });

  it("returns expected group contention without emitting a business 40001", () => {
    expect(migration).toContain("'reason', 'GROUP_RESERVATION_CONFLICT'");
    expect(migration).toContain("'reason', 'GROUP_SIZE_CONFLICT'");
    expect(migration).not.toMatch(/raise exception using errcode='40001', message='GROUP_RESERVATION_CONFLICT'/);
    expect(migration).not.toMatch(/raise exception using errcode='40001', message='GROUP_SIZE_CONFLICT'/);
  });

  it("keeps the reservation RPCs service-role only", () => {
    expect(migration).toContain("revoke all on function public.matchmaking_reserve_pair");
    expect(migration).toContain("grant execute on function public.matchmaking_reserve_pair");
    expect(migration).toContain("revoke all on function public.matchmaking_reserve_group_member");
    expect(migration).toContain("grant execute on function public.matchmaking_reserve_group_member");
  });
});
