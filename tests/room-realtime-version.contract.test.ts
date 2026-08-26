import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260827013000_room_realtime_version.sql", "utf8");

describe("Room realtime version contract", () => {
  it("uses a monotonic server-issued version for every Room and roster mutation", () => {
    expect(migration).toContain("add column if not exists realtime_version bigint not null default 0");
    expect(migration).toContain("create or replace function public.bump_room_realtime_version()");
    expect(migration).toContain("create trigger room_members_bump_realtime_version");
    expect(migration).toContain("create trigger rooms_bump_realtime_version");
  });

  it("does not expose the security-definer trigger helper as an RPC", () => {
    expect(migration).toContain("revoke all on function public.bump_room_realtime_version() from public, anon, authenticated;");
  });
});
