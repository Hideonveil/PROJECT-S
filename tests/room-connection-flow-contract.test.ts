import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("room connection flow contract", () => {
  it("forces every active room onto the canonical Session route", () => {
    const app = read("public/js/app.js");
    expect(app).toContain('if (isActiveSessionRoom(state.room) && route.name !== "room")');
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

  it("uses ranked role groups and a casual teammate count", () => {
    const home = read("public/js/pages/home.js");
    expect(home).toContain('{ key: "roles", label: "位置" }');
    expect(home).toContain('{ key: "intent", label: "组队方式" }');
    expect(home).toContain('"home-casual-intent"');
    expect(home).toContain('更多（高级选项）');
    expect(home).toContain("我的位置");
    expect(home).toContain("希望队友位置");
  });
});
