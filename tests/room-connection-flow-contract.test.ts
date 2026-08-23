import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("room connection flow contract", () => {
  it("does not force an active room over the route selected by the player", () => {
    const app = read("public/js/app.js");
    expect(app).not.toContain('if (patch.room && routeName !== "room")');
  });

  it("starts matched rooms automatically and ends normal play through mutual goodbye", () => {
    const room = read("public/js/pages/room.js");
    expect(room).not.toContain("开始游戏");
    expect(room).toContain("拜拜是正常共同结束");
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
    expect(home).toContain('{ key: "team", label: "队友人数" }');
    expect(home).toContain("我的位置");
    expect(home).toContain("希望队友位置");
  });
});
