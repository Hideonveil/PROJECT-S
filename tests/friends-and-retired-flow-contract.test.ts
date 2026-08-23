import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("friends flow and retired matching cleanup", () => {
  it("returns the matched friend code and adds friends by stable profile id", () => {
    const search = readFileSync("src/app/api/friends/search/route.ts", "utf8");
    const add = readFileSync("src/app/api/friends/add/route.ts", "utf8");
    expect(search).toContain("friendCode: target.friend_code");
    expect(add).toContain("body.targetUserId");
    expect(add).toContain('targetQuery.eq("id", targetUserId)');
  });

  it("has removed retired pages and endpoints", () => {
    for (const path of [
      "public/js/pages/need.js",
      "public/js/pages/results.js",
      "public/js/pages/profile.js",
      "src/app/api/need/route.ts",
      "src/app/api/apply/route.ts",
      "src/app/api/accept-application/route.ts",
      "src/app/api/decline-application/route.ts",
    ]) expect(existsSync(path), path).toBe(false);
    expect(existsSync("src/lib/room.ts")).toBe(false);
    const store = readFileSync("public/js/store.js", "utf8");
    const me = readFileSync("public/js/pages/me.js", "utf8");
    expect(store).not.toContain("history: []");
    expect(me).not.toContain("localHistory");
  });

  it("keeps per-member likes separate from experience feedback", () => {
    const feedback = readFileSync("src/app/api/room/[code]/feedback/route.ts", "utf8");
    expect(feedback).toContain("targetUserId");
    expect(feedback).toContain('from("session_member_likes")');
    expect(feedback).toContain("session_responses");
    expect(feedback).not.toContain('select("liked")');
    expect(feedback).not.toContain("effectiveLiked");
    expect(feedback).toContain("p_tags: []");
  });

  it("does not let one player complete a normal game alone", () => {
    expect(existsSync("src/app/api/room/[code]/finish/route.ts")).toBe(false);
    const goodbye = readFileSync("src/app/api/room/[code]/goodbye/route.ts", "utf8");
    expect(goodbye).toContain("phase1_request_goodbye");
  });
});
