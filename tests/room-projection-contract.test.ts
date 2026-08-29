import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authoritative RoomProjection contract", () => {
  const migrationPath = "supabase/migrations/20260829160000_authoritative_room_projection.sql";

  it("reads lifecycle facts in one PostgreSQL statement snapshot", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("create or replace function public.read_room_projection");
    expect(migration).toContain("'members'");
    expect(migration).toContain("'session'");
    expect(migration).toContain("'tickets'");
    expect(migration).toContain("'recruitmentVotes'");
    expect(migration).toContain("'goodbyeRequests'");
    expect(migration).toContain("'settlements'");
    expect(migration).toContain("revoke all on function public.read_room_projection(uuid)");
    expect(migration).toContain("grant execute on function public.read_room_projection(uuid) to service_role");
  });

  it("uses the projection as the lifecycle source for Room enrichment", () => {
    const readModel = readFileSync("src/lib/room-read-model.ts", "utf8");
    expect(readModel).toContain('.rpc("read_room_projection"');
    expect(readModel).toContain("projection.members");
    expect(readModel).toContain("projection.session");
    expect(readModel).toContain("projection.recruitmentVotes");
  });
});
