import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("active Session refresh recovery", () => {
  const app = read("public/js/app.js");
  const authController = read("public/js/auth-controller.js");
  const api = read("public/js/api.js");
  const offline = read("src/app/api/offline/route.ts");
  const dataApi = read("src/lib/room-read-model.ts");

  it("does not convert pagehide or beforeunload into an explicit exit", () => {
    expect(app).not.toMatch(/window\.addEventListener\("pagehide",[\s\S]*?markPresenceOffline\(\)/);
    expect(app).not.toMatch(/window\.addEventListener\("beforeunload",[\s\S]*?markPresenceOffline\(\)/);
    expect(app).toContain('window.addEventListener("pageshow"');
    expect(app).toContain("refreshAuthenticatedState");
  });

  it("fail-closes the destructive offline endpoint unless logout is explicit", () => {
    expect(offline).toContain('body?.reason !== "explicit_logout"');
    expect(api).toContain('JSON.stringify({ reason })');
    expect(api).not.toContain("sendBeacon");
  });

  it("restores active rooms from the server snapshot on resume", () => {
    const authority = read("public/js/room-authority.js");
    expect(app).toContain("const read = await readServerState();");
    expect(app).toContain("observedGeneration: read.observedGeneration");
    expect(authController).toContain("const observedGeneration = captureRoomAuthority();");
    expect(authController).toContain('applyServerSnapshot(snapshot, { source: "state", route: authorityRoute, observedGeneration });');
    expect(authority).toContain('return ROOM_SWITCH_SOURCES.has(source) ? "enter-room" : "prompt-resume";');
    expect(app).toContain('replaceCanonicalRoute("#/room")');
    expect(app).toContain("history.replaceState");
  });

  it("looks up the active room through room_members and restores all members", () => {
    expect(dataApi).toContain('.from("room_members")');
    expect(dataApi).toContain('.eq("status", "active")');
    expect(dataApi).toContain("return enrichRoom(candidate.room, { context, session: candidate.session, resumeEligible: true });");
    expect(dataApi).toContain("activeRoomCandidate");
    expect(dataApi).not.toContain("activeSessionFor(profileId).then");
  });
});
