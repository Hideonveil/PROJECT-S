import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("public matchmaking direct-join contract", () => {
  it("exposes only an opaque ticket handle for active search entries", () => {
    const api = read("src/lib/api.ts");
    expect(api).toContain('.select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference")');
    expect(api).toContain('.eq("state", "searching")');
    expect(api).toContain("ticketId: row.id");
  });

  it("requires authentication and validates the ticket before reserving a pair or group", () => {
    const route = read("src/app/api/matchmaking/join/route.ts");
    const service = read("src/lib/matchmaking/service.ts");
    expect(route).toContain("requireRequestProfile");
    expect(route).toContain("DIRECT_JOIN_INVALID");
    expect(route).toContain("joinPublicTicket");
    expect(service).toContain("DIRECT_JOIN_UNAVAILABLE");
    expect(service).toContain("matchmaking_reserve_pair");
    expect(service).toContain("matchmaking_reserve_group_member");
    expect(service).toContain('p_reason: "direct_join_failed"');
    expect(service).toContain("active.request_id === requestId");
    expect(service).toContain("createdTicket?.reused");
    expect(route).toContain("[0-9a-f]{4}-[0-9a-f]{12}");
    expect(route).toContain("[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
  });

  it("keeps the public directory informational instead of making it a direct-join control", () => {
    const home = read("public/js/pages/home.js");
    const landing = read("public/js/pages/landing.js");
    const app = read("public/js/app.js");
    expect(home).not.toContain('data-action="join-public-match"');
    expect(landing).not.toContain('data-action="join-public-match"');
    expect(app).not.toContain("openPublicJoinConfirm");
    expect(app).not.toContain("confirmPublicJoin");
  });

  it("localizes stored rank codes before public display", () => {
    const ranks = read("public/js/ranks.js");
    const home = read("public/js/pages/home.js");
    const landing = read("public/js/pages/landing.js");
    expect(ranks).toContain('archon: "蜜使（铂金）"');
    expect(home).toContain("rankLabel(person.rankCode");
    expect(landing).toContain("rankLabel(rankCode)");
  });
});
