import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;

describe("architecture hotspot ratchets", () => {
  it("keeps the matchmaking facade smaller than its domain modules", () => {
    expect(lines("src/lib/matchmaking/service.ts")).toBeLessThan(300);
  });

  it("keeps shared API helpers from absorbing the Room read model again", () => {
    expect(lines("src/lib/api.ts")).toBeLessThan(400);
    expect(readFileSync("src/lib/api.ts", "utf8")).toContain('from "./room-read-model"');
  });

  it("keeps the OPS page below the previous monolith size", () => {
    expect(lines("src/app/ops/page.tsx")).toBeLessThan(500);
  });

  it("ratchets the browser shell while remaining controller work continues", () => {
    expect(lines("public/js/app.js")).toBeLessThan(4_200);
    const app = readFileSync("public/js/app.js", "utf8");
    expect(app).toContain("createRoomChatController");
    expect(app).toContain("createAuthController");
  });
});
