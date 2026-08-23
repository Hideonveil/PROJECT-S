import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("realtime component patch contract", () => {
  it("subscribes to goodbye changes and updates only the canonical Session UI", () => {
    const realtime = readFileSync("public/js/realtime.js", "utf8");
    const app = readFileSync("public/js/app.js", "utf8");
    expect(realtime).toContain('table: "session_goodbye_requests"');
    expect(app).toContain("function updateSessionView");
    expect(app).not.toContain("function updateRoomView");
    expect(app).not.toContain('document.querySelector(".room-page")');
  });

  it("keeps an explicit room entry in the product navigation", () => {
    const ui = readFileSync("public/js/ui.js", "utf8");
    expect(ui).toContain('href: "#/room"');
    expect(ui).toContain("进行中的房间");
  });
});
