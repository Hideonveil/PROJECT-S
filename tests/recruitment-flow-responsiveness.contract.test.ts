import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRoomAuthority } from "../public/js/room-authority.js";

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
    const authority = createRoomAuthority({
      normalizeRoom: (room: any) => room,
      roomSignature: (room: any) => JSON.stringify(room),
      isResumableRoom: () => true,
    });
    const room = { id: "room-1", realtimeVersion: 1, recruiting: true };
    authority.dispatch({ type: "snapshot", room, source: "start", route: "home" });
    authority.dispatch({ type: "begin-exit", roomId: room.id });

    expect(authority.dispatch({
      type: "snapshot",
      room: { ...room, realtimeVersion: 2 },
      source: "realtime",
      route: "room",
    })).toMatchObject({ decision: "ignore", reason: "exit-pending" });
  });

  it("uses a continuous recruitment scan and leaves action icons still", () => {
    expect(styles).toContain("animation: roomRecruitmentScan 1.1s linear infinite;");
    expect(app).not.toContain('button.querySelector(".icon")?.classList.add("is-spinning")');
    expect(app).toContain('label.textContent = action === "toggle-recruitment-vote" ? "正在确认操作结果…"');
  });
});
