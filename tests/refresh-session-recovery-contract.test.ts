import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("active Session refresh recovery", () => {
  const app = read("public/js/app.js");
  const api = read("public/js/api.js");
  const offline = read("src/app/api/offline/route.ts");
  const dataApi = read("src/lib/api.ts");

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
    expect(app).toContain('const snapshot = await api.getState();');
    expect(app).toContain('if (restoreRoute && snapshot.room');
    expect(app).toContain('["home", "auth", "welcome", "matching"].includes(parseRoute().name)');
    expect(app).toContain('replaceCanonicalRoute("#/room")');
    expect(app).toContain("history.replaceState");
  });

  it("looks up the active room through room_members and restores all members", () => {
    expect(dataApi).toContain('.from("room_members")');
    expect(dataApi).toContain('.eq("status", "active")');
    expect(dataApi).toContain("return enrichRoom(candidate.room, { context, session: candidate.session });");
    expect(dataApi).toContain("activeRoomCandidate");
    expect(dataApi).not.toContain("activeSessionFor(profileId).then");
  });
});
