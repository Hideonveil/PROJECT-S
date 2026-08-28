import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");
const startRoute = readFileSync("src/app/api/matchmaking/start/route.ts", "utf8");
const styles = readFileSync("public/styles/product-shell.css", "utf8");

describe("recruitment flow responsiveness", () => {
  it("returns the newly created Room from the start response instead of forcing a full state polling loop", () => {
    expect(startRoute).toContain("activeRoomShellFor(profile.id");
    expect(app).toContain("if (startData?.room)");
    expect(app).not.toContain("const ROOM_FIRST_RECONCILE_DELAYS_MS = [0, 250, 750];");
  });

  it("suppresses stale recruiting snapshots while a user is leaving", () => {
    expect(app).toContain("recruitmentExitPending");
    expect(app).toContain("recruitmentExitRoomId");
    expect(app).toContain("isRecruitmentExitRoom");
    expect(app).not.toContain('recruitmentExitPending && parseRoute().name === "room"');
  });

  it("uses a continuous recruitment scan and leaves action icons still", () => {
    expect(styles).toContain("animation: roomRecruitmentScan 1.1s linear infinite;");
    expect(app).not.toContain('button.querySelector(".icon")?.classList.add("is-spinning")');
    expect(app).toContain('label.textContent = action === "toggle-recruitment-vote" ? "正在确认操作结果…"');
  });
});
