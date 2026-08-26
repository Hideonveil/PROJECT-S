import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");

describe("Room entry transition and recruitment exit race", () => {
  it("runs the full-screen transition while entering the Room instead of dropping it from the fast path", () => {
    const start = app.indexOf("async function startMatch()");
    const end = app.indexOf("function startMatchingFlow", start);
    const source = app.slice(start, end);

    expect(source).toContain("withProjectTransition");
    expect(source).toContain('label: "正在进入招募"');
    expect(source).toContain("immediate: true");
    expect(source).toContain("minDuration: 360");
    expect(source.indexOf("await api.startMatchmaking")).toBeGreaterThan(source.indexOf("withProjectTransition"));
    expect(source).toContain('replaceCanonicalRoute("#/room")');
  });

  it("keeps the exited Room tombstoned after navigation so late snapshots cannot reopen it", () => {
    expect(app).toContain('let recruitmentExitRoomId = "";');
    expect(app).toContain("function isRecruitmentExitRoom(room)");
    expect(app).toContain("if (isRecruitmentExitRoom(patch.room)) delete patch.room;");
    expect(app).toContain("if (isRecruitmentExitRoom(room)) return;");
    expect(app).toContain("!isRecruitmentExitRoom(snapshot.room)");
    expect(app).not.toContain('recruitmentExitPending && parseRoute().name === "room"');
    expect(app).not.toContain("window.setTimeout(() => { recruitmentExitPending = false; }, 800);");
  });
});
