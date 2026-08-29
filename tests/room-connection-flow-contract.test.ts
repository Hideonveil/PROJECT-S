import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("room connection flow contract", () => {
  // Architecture ratchet: these assertions protect forbidden duplicate
  // routes/owners. Observable Room transitions are paired with the Room-first
  // browser regressions in mvp-closure.spec.ts.
  it("routes matching into Room while Home requires an explicit resume choice", () => {
    const app = read("public/js/app.js");
    const authority = read("public/js/room-authority.js");
    expect(app).toContain("createRoomAuthority({");
    expect(authority).toContain('if (route === "home") return ROOM_SWITCH_SOURCES.has(source) ? "enter-room" : "prompt-resume";');
    expect(authority).toContain('if (route === "matching") return "enter-room";');
    expect(app).toContain('replaceCanonicalRoute("#/room")');
    expect(app).toContain("html = sessionPage(state);");
    expect(app).not.toContain("function updateRoomView");
  });

  it("starts matched rooms automatically and ends normal play through mutual goodbye", () => {
    const session = read("public/js/pages/session-preview.js");
    expect(session).not.toContain("开始游戏");
    expect(session).toContain("所有成员都确认后进入赛后反馈");
    expect(existsSync("src/app/api/room/[code]/goodbye/route.ts")).toBe(true);
    expect(existsSync("src/app/api/room/[code]/start/route.ts")).toBe(false);
  });

  it("requires the receiver to accept a 机缘 friend request", () => {
    const add = read("src/app/api/friends/add/route.ts");
    expect(add).toContain("phase1_request_friendship");
    expect(existsSync("src/app/api/friends/respond/route.ts")).toBe(true);
  });

  it("keeps only like and play experience on the post-game screen", () => {
    const gameover = read("public/js/pages/gameover.js");
    expect(gameover).not.toContain("下次还愿意");
    expect(gameover).not.toContain("set-room-want");
    expect(gameover).toContain("好友系统 COMING SOON");
  });

  it("routes a Session UPDATE to the game-over screen for both goodbye participants", () => {
    const realtime = read("public/js/realtime.js");
    expect(realtime).toContain('table: "sessions" }, async (payload) =>');
    expect(realtime).toContain("terminalSessionFromChange(payload)");
    expect(realtime).toContain('handlers["game-over"]?.({ session })');
  });

});
