import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("active Room recovery contract", () => {
  const app = read("public/js/app.js");
  const authController = read("public/js/auth-controller.js");
  const api = read("src/lib/room-read-model.ts");

  it("requires an explicit server-side resume signal before taking over the UI route", () => {
    expect(app).toContain("room.resumeEligible === true");
    expect(app).toContain("isActiveSessionRoom(snapshot.room)");
    expect(authController).toContain("hasActiveRoom = !isRecruitmentExitRoom(snapshot.room) && isActiveSessionRoom(snapshot.room);");
  });

  it("does not restore an active member-only Room without a live ticket, group, or Session", () => {
    expect(api).toContain('.from("matchmaking_tickets")');
    expect(api).toContain('const LIVE_TICKET_STATES = ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"];');
    expect(api).toContain('.in("state", LIVE_TICKET_STATES)');
    expect(api).toContain('.from("matchmaking_groups")');
    expect(api).toContain('resumeEligible: true });');
  });
});
