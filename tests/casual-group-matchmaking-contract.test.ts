import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/0016_casual_group_matchmaking.sql", "utf8");
const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
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
    expect(service).toContain("desiredTeammates: Number(row.desired_teammates || 1)");
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

  it("renders a dual-thumb casual teammate range and carries both bounds", () => {
    expect(homePage).toContain("data-home-team-range-input=\"min\"");
    expect(homePage).toContain("data-home-team-range-input=\"max\"");
    expect(homePage).toContain("data-team-range-detent");
    expect(homePage).toContain("严格匹配");
    expect(homePage).not.toContain("可接受队友人数</b>");
    expect(homePage).not.toContain("拖动方块吸附到刻度");
    expect(homePage).not.toContain("只加入人数范围与你有交集的队伍");
    expect(app).toContain("DRAFT.teamMin");
    expect(app).toContain("DRAFT.teamMax");
    expect(app).toContain("stepHomeTeamDetent");
    expect(app).toContain("minTeammates: matchInput.minTeammates");
  });

  it("enforces the range intersection inside the locked group RPCs", () => {
    expect(rangeMigration).toContain("GROUP_SIZE_CONFLICT");
    expect(rangeMigration).toContain("greatest(coalesce(max(t.min_teammates),1), v_ticket.min_teammates)");
    expect(rangeMigration).toContain("least(coalesce(min(t.desired_teammates),5), v_ticket.desired_teammates)");
    expect(rangeMigration).toContain("v_count < v_group_min or v_count > v_group_max");
  });
});
