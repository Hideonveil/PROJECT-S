import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825160000_terminalize_room_members_on_terminal.sql",
  "utf8",
);

describe("terminal room/member invariant migration", () => {
  it("is forward-only and does not backfill historical rows", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration).toContain("does not backfill or mutate historical residue rows");
  });

  it("terminalizes every still-active member with an exit timestamp", () => {
    expect(migration).toContain("update public.room_members");
    expect(migration).toContain("set status = 'exited'");
    expect(migration).toContain("exited_at = coalesce(exited_at, p_terminal_at, now())");
    expect(migration).toContain("where room_id = p_room_id");
    expect(migration).toContain("and status = 'active'");
  });

  it("covers both Session and Room terminal transitions", () => {
    expect(migration).toContain("new.status in ('completed', 'cancelled')");
    expect(migration).toContain("new.status in ('completed', 'cancelled', 'finished', 'closed')");
    expect(migration).toContain("on public.sessions");
    expect(migration).toContain("on public.rooms");
    expect(migration).toContain("phase1_terminalize_members_after_session");
    expect(migration).toContain("phase1_terminalize_members_after_room");
  });

  it("keeps trigger functions internal", () => {
    expect(migration).toContain("revoke all on function public.phase1_terminalize_room_members(uuid, timestamptz)");
    expect(migration).toContain("revoke all on function public.phase1_terminalize_members_after_session()");
    expect(migration).toContain("revoke all on function public.phase1_terminalize_members_after_room()");
    expect(migration).toContain("grant execute on function public.phase1_terminalize_room_members(uuid, timestamptz)");
  });
});
