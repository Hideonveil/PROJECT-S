import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");
const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
const startRoute = readFileSync("src/app/api/matchmaking/start/route.ts", "utf8");
const api = readFileSync("src/lib/room-read-model.ts", "utf8");
const sessionPage = readFileSync("public/js/pages/session-preview.js", "utf8");
const instrumentation = readFileSync("src/instrumentation.ts", "utf8");

const startMatchSource = app.slice(app.indexOf("async function startMatch()"), app.indexOf("function startMatchingFlow()"));

// Performance architecture ratchet: a public response cannot prove that the
// start route did not synchronously invoke the matcher or issue a fallback
// state read. Shell timing and visible behavior are also covered by browser E2E.
describe("room shell entry fast path", () => {
  it("does not await a synchronous matcher attempt before returning start", () => {
    expect(service).not.toContain('if (input.mode === "casual") await attemptCasualGroup(userId);');
    expect(service).not.toContain("else await attemptMatch(userId);");
    expect(service).not.toContain("wakePersistentMatcher");
    expect(instrumentation).toContain("startPersistentMatcher();");
  });

  it("returns a minimal shell from the start route", () => {
    expect(startRoute).toContain("activeRoomShellFor(profile.id");
    expect(startRoute).not.toContain("activeRoomFor(profile.id, createStateReadContext())");
    expect(api).toContain("export async function activeRoomShellFor");
    expect(api).toContain("shell: true");
  });

  it("keeps the entry transition visual-only and does not add a full state fallback read", () => {
    expect(app).toContain("if (startData?.room)");
    expect(app).toContain('applyServerSnapshot({ room: startData.room }, { source: "start" })');
    expect(app).not.toContain("const ROOM_FIRST_RECONCILE_DELAYS_MS = [0, 300];");
    expect(startMatchSource).not.toContain("await api.getState()");
    expect(startMatchSource).toContain('label: "正在进入招募"');
    expect(startMatchSource).toContain("if (!(await reconcileRoomFirstStart(response)))");
  });

  it("renders a chat skeleton while the Room shell hydrates", () => {
    expect(sessionPage).toContain("chat-skeleton");
    expect(sessionPage).toContain("model.shell");
  });
});
