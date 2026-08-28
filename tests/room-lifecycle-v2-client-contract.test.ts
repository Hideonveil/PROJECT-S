import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");
const api = readFileSync("public/js/api.js", "utf8");
const driver = readFileSync("tools/capacity/production-agent-driver.mjs", "utf8");

describe("Room lifecycle V2 client contract", () => {
  it("asks before resuming from Home and gives the player forty seconds", () => {
    expect(app).toContain("scheduleResumeRoomPrompt");
    expect(app).toContain("Date.now() + 40_000");
    expect(app).toContain('"accept-resume-room"');
    expect(app).toContain('"decline-resume-room"');
  });

  it("uses operation ids and acknowledgement states for chat", () => {
    expect(api).toContain("clientInstanceId");
    expect(api).toContain("operationId");
    expect(app).toContain('delivery_status: "pending"');
    expect(app).toContain('delivery_status: "failed"');
    expect(app).toContain('"retry-chat"');
  });

  it("keeps the capacity runner on the same production APIs as a player", () => {
    expect(driver).toContain("/messages`");
    expect(driver).toContain("/recruitment`");
    expect(driver).not.toContain('.from("messages").insert');
    expect(driver).not.toContain("matchmaking.group.start");
  });
});
