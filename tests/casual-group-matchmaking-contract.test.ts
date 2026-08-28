import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ticketFromRow } from "../src/lib/matchmaking/records";

const sql = readFileSync("supabase/migrations/0016_casual_group_matchmaking.sql", "utf8");
const matchingPage = readFileSync("public/js/pages/matching.js", "utf8");
const api = readFileSync("public/js/api.js", "utf8");
const homePage = readFileSync("public/js/pages/home.js", "utf8");
const app = readFileSync("public/js/app.js", "utf8");
const rangeMigration = readFileSync("supabase/migrations/20260822090000_casual_team_range_intersection.sql", "utf8");
const twoPlayerStartMigration = readFileSync("supabase/migrations/20260822183000_casual_group_start_with_two.sql", "utf8");

describe("casual group matchmaking wiring", () => {
  it("has a separate group and member persistence model", () => {
    expect(sql).toContain("create table if not exists public.matchmaking_groups");
    expect(sql).toContain("create table if not exists public.matchmaking_group_members");
    expect(sql).toContain("desired_teammates");
    expect(sql).toContain("min_teammates");
    expect(sql).toContain("group_id");
  });

  it("treats the requested teammate count as excluding the owner", () => {
    expect(sql).toContain("desired_teammates excludes the owner");
    expect(sql).toContain("v_member_count >= v_group.desired_teammates + 1");
    expect(ticketFromRow({
      id: "ticket-1",
      user_id: "user-1",
      game_id: "deadlock",
      mode: "casual",
      state: "searching",
      desired_teammates: 3,
      min_teammates: 1,
    }).desiredTeammates).toBe(3);
  });

  it("supports the owner-starts-when-enough flow and independent confirmations", () => {
    expect(sql).toContain("matchmaking_start_group");
    expect(sql).toContain("matchmaking_confirm_group");
    expect(matchingPage).toContain("已满 ${totalPlayers} 人，可开房");
    expect(matchingPage).toContain('data-action="confirm-group-match"');
    expect(matchingPage).toContain('data-action="start-group-match"');
  });

  it("allows a casual owner to open with one teammate regardless of the requested target", () => {
    expect(twoPlayerStartMigration).toContain("v_count < 1");
    expect(twoPlayerStartMigration).toContain("One teammate means two total players");
    expect(matchingPage).toContain("teammates.length >= 1");
    expect(matchingPage).toContain("0秒");
    expect(app).toContain("totalSeconds < 60");
    expect(app).toContain("${minutes}分${seconds}秒");
  });

  it("publishes group changes and exposes a dedicated start endpoint", () => {
    expect(sql).toContain("supabase_realtime add table public.matchmaking_groups");
    expect(sql).toContain("supabase_realtime add table public.matchmaking_group_members");
    expect(api).toContain("startMatchGroup");
    expect(api).toContain("/api/matchmaking/group/start");
  });

  it("detaches stale partial-group tickets so they can be matched again", () => {
    expect(sql).toContain("A partially filled group can also go stale");
    expect(sql).toContain("group_id=null,confirmation_deadline=null");
    expect(sql).toContain("where group_id in (select id from public.matchmaking_groups");
  });

  it("uses one Casual pool with an optional soft total-player preference", () => {
    expect(homePage).toContain("偏好人数");
    expect(homePage).toContain("只影响优先顺序，不会错过合适玩家");
    expect(homePage).toContain('"home-preferred-total"');
    expect(app).toContain('desiredTeammates: DRAFT.goal === "娱乐" ? 5');
    expect(app).toContain('recruitmentMode: DRAFT.goal === "娱乐" ? "open"');
    expect(app).toContain("preferredTotalPlayers");
  });

  it("enforces the range intersection inside the locked group RPCs", () => {
    expect(rangeMigration).toContain("GROUP_SIZE_CONFLICT");
    expect(rangeMigration).toContain("greatest(coalesce(max(t.min_teammates),1), v_ticket.min_teammates)");
    expect(rangeMigration).toContain("least(coalesce(min(t.desired_teammates),5), v_ticket.desired_teammates)");
    expect(rangeMigration).toContain("v_count < v_group_min or v_count > v_group_max");
  });
});
