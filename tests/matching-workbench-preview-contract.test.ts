import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("public/js/pages/matching.js", "utf8");
const css = readFileSync("public/styles/product-shell.css", "utf8");
const app = readFileSync("public/js/app.js", "utf8");

describe("matching workbench preview contract", () => {
  it("keeps the player roster on the left and the intent details on the right", () => {
    expect(page).toContain('aria-label="用户栏"');
    expect(page).toContain("matching-modal-content--workbench");
    expect(page).toContain("寻找与您游戏目标一致的玩家中");
  });

  it("uses the requested roster placeholder animation", () => {
    expect(page).toContain('class="progress"');
    expect(page).toContain('class="inner"');
    expect(css).toContain("matchingRosterProgress");
    const activePreview = page.slice(page.indexOf("function matchingWorkbench"));
    expect(activePreview).not.toContain("匹配池人数");
    expect(activePreview).not.toContain("锁定候选");
  });

  it("rebuilds the roster when a pair candidate enters or leaves", () => {
    expect(app).toContain("previousAwaiting");
    expect(app).toContain("stale placeholder");
    expect(app).toContain("previousCandidateMeta");
  });

  it("shows a matched teammate's rank and microphone status prominently", () => {
    expect(page).toContain("memberRank");
    expect(page).toContain("memberMicrophone");
    expect(page).toContain("matching-roster-member-meta");
    expect(css).toContain("matching-roster-member-meta strong");
  });
});
