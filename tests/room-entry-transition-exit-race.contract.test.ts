import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRoomAuthority } from "../public/js/room-authority.js";

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
    expect(source).toContain("if (!(await reconcileRoomFirstStart(response)))");
    expect(source).not.toContain('if (await reconcileRoomFirstStart(response)) replaceCanonicalRoute("#/room")');
  });

  it("keeps the exited Room tombstoned after navigation so late snapshots cannot reopen it", () => {
    const authority = createRoomAuthority({
      normalizeRoom: (room: any) => room,
      roomSignature: (room: any) => JSON.stringify(room),
      isResumableRoom: () => true,
    });
    const room = { id: "room-1", realtimeVersion: 1 };
    authority.dispatch({ type: "snapshot", room, source: "start", route: "home" });
    authority.dispatch({ type: "begin-exit", roomId: room.id });
    authority.dispatch({ type: "exit-complete", roomId: room.id });

    expect(authority.dispatch({
      type: "snapshot",
      room: { ...room, realtimeVersion: 2 },
      source: "realtime",
      route: "home",
    })).toMatchObject({ decision: "ignore", reason: "exited-room" });
  });

  it("keeps the original Room id through cancel reconciliation", () => {
    expect(app).toContain('const recruitmentRoomId = roomRecruitment ? state.room?.id || "" : "";');
    expect(app).toContain('roomAuthority.dispatch({ type: "exit-complete", roomId: recruitmentRoomId });');
    expect(app).toContain('roomAuthority.dispatch({ type: "exit-failed", roomId: recruitmentRoomId });');
  });
});
