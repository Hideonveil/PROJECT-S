import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("per-member Session likes contract", () => {
  it("defines a forward-only table with one row per directed member pair", () => {
    expect(existsSync("supabase/migrations/20260824100000_session_member_likes.sql")).toBe(true);
    const migration = read("supabase/migrations/20260824100000_session_member_likes.sql");
    expect(migration).toContain("create table if not exists public.session_member_likes");
    expect(migration).toContain("primary key (session_id, from_user_id, to_user_id)");
    expect(migration).toContain("from_user_id <> to_user_id");
  });

  it("renders an independent like control for every teammate", () => {
    const gameover = read("public/js/pages/gameover.js");
    expect(gameover).toContain("data-target-user-id");
    expect(gameover).toContain("likedByMe");
    expect(gameover).toContain("teammates.map");
    expect(gameover).not.toContain("为 ${teammateLabel} 点赞");
    expect(gameover).not.toContain("data-gameover-like aria-pressed");
  });

  it("sends a target user and never writes the new like to the legacy response", () => {
    const feedback = read("src/app/api/room/[code]/feedback/route.ts");
    expect(feedback).toContain("targetUserId");
    expect(feedback).toContain("session_member_likes");
    expect(feedback).toContain("LIKE_TARGET_REQUIRED");
    expect(feedback).toContain("LIKE_SELF_FORBIDDEN");
    expect(feedback).not.toContain('select("liked")');
    expect(feedback).not.toContain("effectiveLiked");
    expect(feedback).not.toContain('patch.liked = liked');
  });

  it("hydrates per-member like state for a completed Session", () => {
    const api = read("src/lib/api.ts");
    const route = read("src/app/api/state/route.ts");
    expect(api).toContain("completedSessionViewFor");
    expect(api).toContain('.contains("players", JSON.stringify([profileId]))');
    expect(api).toContain("likedByMe");
    expect(api).toContain("session_member_likes");
    expect(route).toContain("completedSessionViewFor");
  });
});
