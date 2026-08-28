import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameoverPage } from "../public/js/pages/gameover.js";
import { sessionPage } from "../public/js/pages/session-preview.js";
import { mergeRoomMessages } from "../public/js/chat-merge.js";

const app = readFileSync("public/js/app.js", "utf8");
const chatController = readFileSync("public/js/room-chat-controller.js", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");
const stateRoute = readFileSync("src/app/api/state/route.ts", "utf8");
const realtime = readFileSync("public/js/realtime.js", "utf8");
const http = readFileSync("src/lib/http.ts", "utf8");

const self = { id: "user-a", nickname: "玩家A", username: "player-a", avatarKey: "a", online: true };
const teammate = { id: "user-b", nickname: "玩家B", username: "player-b", avatarKey: "b", online: true };

describe("reported Room lifecycle regressions", () => {
  it("keeps historical Session teammates visible after Room members exit", () => {
    const html = gameoverPage({
      authenticated: true,
      onboarded: true,
      user: self,
      session: {
        roomCode: "ROOM-1",
        status: "completed",
        players: [self.id, teammate.id],
        members: [
          { ...self, memberStatus: "exited" },
          { ...teammate, memberStatus: "exited" },
        ],
        targetTotalPlayers: 2,
      },
    } as any);

    expect(html).toContain("玩家B");
    expect(html).toContain('data-gameover-like');
  });

  it("does not invent a second player when the live Room roster is temporarily empty", () => {
    const html = sessionPage({
      authenticated: true,
      onboarded: true,
      user: self,
      need: { game: "deadlock", mode: "ranked", rankCode: "oracle" },
      room: {
        id: "room-shell",
        code: "SHELL-1",
        members: [],
        players: [],
        recruiting: true,
        need: { game: "deadlock", mode: "ranked", rankCode: "oracle", target: 2 },
      },
    } as any);

    expect(html).toContain('data-member-count="1"');
    expect(html).not.toContain("PLAYER 02");
  });

  it("keeps only messages belonging to the current Room during reconciliation", () => {
    const oldRoom = { id: "old", room_id: "room-old", sender_id: "user-a", content: "旧房间" };
    const currentRoom = { id: "new", room_id: "room-new", sender_id: "user-b", content: "新房间" };

    expect((mergeRoomMessages as any)([oldRoom], [currentRoom], "room-new")).toEqual([currentRoom]);
  });

  it("reconciles chat history on the first successful subscription", () => {
    expect(chatController).toContain('if (status === "SUBSCRIBED") {');
    expect(chatController).toContain("reconcileHistory().catch(() => {});");
    expect(chatController).not.toContain("if (hasSubscribed) reconcileHistory().catch(() => {});");
  });

  it("uses a versioned Room response for global state reconciliation", () => {
    expect(app).toContain("data?.room?.realtimeVersion");
    expect(app).toContain("function isRoomSnapshotOlder");
    expect(app).toContain("if (isRoomSnapshotOlder(room, state.room)) return;");
    expect(stateRoute).toContain("snapshotVersion: room?.realtimeVersion ?? null");
  });

  it("reconciles the authoritative state when exit races with ticket cancellation", () => {
    const start = app.indexOf("async function cancelMatch()");
    const source = app.slice(start, app.indexOf("function showSheet", start));

    expect(source).toContain("api.getState()");
    expect(source).toContain("!authoritativeSnapshot.room");
    expect(source).toContain('navigate("#/home")');
  });

  it("keeps a bounded authoritative Room watchdog even while Realtime is subscribed", () => {
    expect(realtime).toContain("ACTIVE_ROOM_RECONCILE_MS");
    expect(realtime).toContain("startRoomReconciliation");
    expect(realtime).toContain("handlers.roomActive?.()");
  });

  it("reconciles mutual Goodbye while the first requester is waiting for its peer", () => {
    expect(app).toContain("startGoodbyeReconciliation");
    expect(app).toContain("stopGoodbyeReconciliation");
    expect(app).toContain("goodbyeRequests.some");
  });

  it("classifies Room-first Goodbye state conflicts instead of returning an opaque 500", () => {
    expect(http).toContain("SESSION_NOT_PLAYING");
    expect(http).toContain("SESSION_MEMBER_INACTIVE");
  });
});
