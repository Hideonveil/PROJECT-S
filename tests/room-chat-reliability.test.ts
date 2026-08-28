import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "../public/js/chat-merge.js";

const app = readFileSync("public/js/app.js", "utf8");
const api = readFileSync("public/js/api.js", "utf8");
const messageRoute = readFileSync("src/app/api/room/[code]/messages/route.ts", "utf8");

describe("Room chat reconciliation", () => {
  it("keeps the server acknowledgement and realtime echo as one message", () => {
    const acknowledged = { id: "m-1", sender_id: "a", content: "你好", created_at: "2026-08-27T01:00:00.000Z" };
    const second = { id: "m-2", sender_id: "b", content: "来了", created_at: "2026-08-27T01:00:01.000Z" };

    expect(mergeRoomMessages([acknowledged], [acknowledged, second])).toEqual([acknowledged, second]);
  });

  it("orders a recovered history deterministically after a reconnect", () => {
    const newest = { id: "m-3", sender_id: "b", content: "最后一条", created_at: "2026-08-27T01:00:03.000Z" };
    const oldest = { id: "m-1", sender_id: "a", content: "第一条", created_at: "2026-08-27T01:00:01.000Z" };
    const middle = { id: "m-2", sender_id: "a", content: "第二条", created_at: "2026-08-27T01:00:02.000Z" };

    expect(mergeRoomMessages([newest], [middle, oldest])).toEqual([oldest, middle, newest]);
  });

  it("loads authoritative chat history through the authenticated app API", () => {
    expect(messageRoute).toContain("export async function GET");
    expect(messageRoute).toContain("requireRequestProfile");
    expect(api).toContain("fetchRoomMessages(roomCode)");
    expect(api).not.toContain('.from("messages")');
  });

  it("uses the Room authority stream to repair missed roster and chat events", () => {
    const start = app.indexOf("async function initRoomChat()");
    const source = app.slice(start, app.indexOf("function hydrateRoomAfterShell", start));
    expect(source).toContain('table: "room_state_events"');
    expect(source).toContain("api.getRoomSnapshot(room.code)");
  });
});
