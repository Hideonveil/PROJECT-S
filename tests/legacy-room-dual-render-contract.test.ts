import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("canonical Active Session route contract", () => {
  const app = read("public/js/app.js");
  const matching = read("public/js/pages/matching.js");
  const session = read("public/js/pages/session-preview.js");

  it("renders the canonical Session UI from #/room", () => {
    expect(app).toContain('import { recruitingRoomFragments, sessionPage, sessionPreviewPage } from "./pages/session-preview.js?v=20260826-room-shell-01";');
    expect(app).toContain("html = sessionPage(state);");
    expect(app).not.toContain('import { roomPage } from "./pages/room.js";');
    expect(app).not.toContain("html = roomPage(state);");
    expect(app).not.toMatch(/roomPage\s*\(/);
    expect(existsSync("public/js/pages/room.js")).toBe(false);
  });

  it("does not render an active room inside the matching route", () => {
    expect(matching).not.toContain('import { sessionHandoffPage, sessionPage } from "./session-preview.js";');
    expect(matching).not.toContain("if (state.room) return");
    expect(matching).not.toContain("sessionPage(state)");
    expect(app).not.toContain("sessionHandoff");
    expect(app).toContain('isActiveSessionRoom(state.room) && route.name !== "room"');
    expect(app).toContain('replaceCanonicalRoute("#/room")');
    expect(app.indexOf('isActiveSessionRoom(state.room) && route.name !== "room"')).toBeLessThan(app.indexOf("startMatchingFlow();"));
  });

  it("keeps the canonical Session renderer independent of the matching route", () => {
    expect(session).toContain("export function sessionPage(state)");
    expect(session).not.toContain("sessionHandoffPage");
    expect(app).toContain('case "room":');
    expect(app).toContain("html = sessionPage(state);");
    expect(app).toContain('if (!isActiveSessionRoom(state.room))');
    expect(app).toContain('const terminal = new Set(["finished", "completed", "closed", "cancelled", "expired"]);');
  });

  it("normalizes match success and realtime Room hydration without business writes", () => {
    expect(app).toContain('if (patch.room && routeName === "matching" && isActiveSessionRoom(state.room))');
    expect(app).toContain('if (isActiveSessionRoom(normalized) && parseRoute().name !== "room")');
    expect(app).toContain('history.replaceState(history.state, "", nextUrl)');
  });

  it("uses the canonical route for login, refresh, pageshow, visibility and active-room entry", () => {
    expect(app).toContain('if (hasActiveRoom) replaceCanonicalRoute("#/room");');
    expect(app).toContain('window.addEventListener("pageshow"');
    expect(app).toContain('document.addEventListener("visibilitychange"');
    expect(app).toContain('"open-room": () => replaceCanonicalRoute("#/room")');
    expect(app).toContain('if (restoreRoute && !isRecruitmentExitRoom(snapshot.room) && isActiveSessionRoom(snapshot.room)');
  });
});
