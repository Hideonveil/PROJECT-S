import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("unified Room recruitment contract", () => {
  const types = read("src/lib/types.ts");
  const api = read("src/lib/api.ts");
  const app = read("public/js/app.js");
  const room = read("public/js/pages/session-preview.js");
  const home = read("public/js/pages/home.js");
  const migration = read("supabase/migrations/20260825230000_room_first_matchmaking.sql");
  const casualMigration = read("supabase/migrations/20260825193000_matchmaking_v2_minimal_forming.sql");

  it("exposes recruitment as a Room concern separate from legacy status fields", () => {
    expect(types).toContain("recruiting?: boolean;");
    expect(types).toContain('recruitmentState?: "recruiting" | "locked" | null;');
    expect(api).toContain("recruiting: recruiting");
    expect(api).toContain("recruitmentState:");
    expect(app).toContain("recruiting: room.recruiting === true");
    expect(app).toContain("recruitmentState: room.recruitmentState || null");
  });

  it("renders Ranked and Casual from the same Room surface", () => {
    expect(room).toContain("const recruiting = room.recruiting === true;");
    expect(room).toContain("recruiting ?");
    expect(room).not.toContain("room.isForming === true || (!room.sessionId");
    expect(app).not.toContain('navigate("#/matching")');
    expect(app).toContain('case "matching":');
    expect(app).toContain('replaceCanonicalRoute(isActiveSessionRoom(state.room) ? "#/room" : "#/home")');
    expect(home).toContain("NOW MATCHING");
  });

    it("locks Ranked after the first pair while Casual keeps backfilling", () => {
      expect(migration).toContain("update public.rooms set need=v_need,status='ready',formation_state='formal'");
      expect(casualMigration).toContain("status = 'connecting', formation_state = 'backfilling'");
      expect(casualMigration).toContain("matchmaking_lock_forming_group");
    });
});
