import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "../public/js/chat-merge.js";

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
});
