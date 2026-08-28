import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sessionMembers } from "../public/js/session-members.js";

const read = (path: string) => readFileSync(path, "utf8");

describe("multi-member Session contract", () => {
  it("derives active members and a dynamic Goodbye denominator", () => {
    const model = sessionMembers({
      target: 3,
      members: [
        { id: "a", memberStatus: "active" },
        { id: "b", memberStatus: "active" },
        { id: "c", memberStatus: "active" },
      ],
      goodbyeRequests: [{ userId: "a" }, { userId: "b" }],
    }, "a");

    expect(model.currentMemberCount).toBe(3);
    expect(model.activeMemberCount).toBe(3);
    expect(model.otherMembers.map((member: { id: string }) => member.id)).toEqual(["b", "c"]);
    expect(model.goodbyeCount).toBe(2);
    expect(model.goodbyeDenominator).toBe(3);
    expect(model.targetTotalPlayers).toBe(3);
  });

  it("supports the complete three-member Goodbye progression", () => {
    const members = ["a", "b", "c"].map((id) => ({ id, memberStatus: "active" }));
    for (const requestedIds of [[], ["a"], ["a", "b"], ["a", "b", "c"]]) {
      const model = sessionMembers({ members, target: 3, goodbyeRequests: requestedIds.map((userId) => ({ userId })) }, "a");
      expect(`${model.goodbyeCount}/${model.goodbyeDenominator}`).toBe(`${requestedIds.length}/3`);
    }
  });

  it("keeps the frozen Session participant denominator after one member slips", () => {
    const model = sessionMembers({
      members: [
        { id: "a", memberStatus: "active" },
        { id: "b", memberStatus: "active" },
        { id: "c", memberStatus: "exited" },
      ],
      goodbyeRequests: [{ userId: "a" }, { userId: "b" }],
      sessionSettlements: [{ userId: "c", kind: "slipped" }],
    }, "a");

    expect(model.currentMemberCount).toBe(3);
    expect(model.activeMemberCount).toBe(2);
    expect(model.goodbyeCount).toBe(3);
    expect(model.goodbyeDenominator).toBe(3);
  });

  it("renders all members and avoids a hardcoded Session 2/2 counter", () => {
    const preview = read("public/js/pages/session-preview.js");
    const room = read("public/js/pages/session-preview.js");
    const gameover = read("public/js/pages/gameover.js");
    const app = read("public/js/app.js");

    expect(preview).toContain("model.goodbyeDenominator");
    expect(preview).toContain("groupFitCells(model.players");
    expect(preview).toContain("session-fit-conditions--group");
    expect(preview).toContain("session-fit-link");
    expect(preview).not.toContain("Math.min(2, requestIds.size)");
    expect(room).toContain("visiblePlayers.map");
    expect(room).toContain("groupFitCells(model.players");
    expect(gameover).toContain("teammates.map");
    expect(app).toContain("memberModel.goodbyeDenominator");
    expect(app).not.toContain('textContent = `${count}/2`');
  });

  it("submits Goodbye immediately and keeps the dynamic count on the button", () => {
    const preview = read("public/js/pages/session-preview.js");
    const room = read("public/js/pages/session-preview.js");
    const app = read("public/js/app.js");

    expect(preview).toContain("拜拜（${goodbye.count}/${goodbye.denominator}）");
    expect(preview).toContain('goodbye.mine ? "withdraw-goodbye" : "say-goodbye"');
    expect(room).toContain("拜拜（${goodbye.count}/${goodbye.denominator}）");
    expect(room).toContain('goodbye.mine ? "withdraw-goodbye" : "say-goodbye"');
    expect(app).toContain('"say-goodbye": () => setGoodbyeRequest(true)');
    expect(app).not.toContain("connection-goodbye-confirm");
    expect(app).not.toContain('"confirm-goodbye"');
  });

  it("restores every casual group ticket condition through the room DTO", () => {
    const api = read("src/lib/room-read-model.ts");
    expect(api).toContain('from("matchmaking_groups")');
    expect(api).toContain('from("matchmaking_group_members")');
    expect(api).toContain("desired_teammates,min_teammates");
    expect(api).toContain("currentMemberCount");
  });

  it("keeps directed N*(N-1) recent connections and the ranked duo rule", () => {
    const terminal = read("supabase/migrations/20260822210000_sync_room_with_terminal_session.sql");
    const ranked = read("supabase/migrations/20260820100000_deadlock_ranked_duo_only.sql");
    expect(terminal).toContain("join public.room_members b");
    expect(terminal).toContain("b.user_id <> a.user_id");
    expect(ranked).toContain("Ranked mode is duo-only");
  });
});
