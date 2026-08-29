import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Room Realtime invalidation contract", () => {
  it("publishes the Room event stream and uses it only to trigger authoritative hydration", () => {
    const migration = readFileSync("supabase/migrations/20260829164500_publish_room_state_events.sql", "utf8");
    const realtime = readFileSync("public/js/realtime.js", "utf8");
    expect(migration).toContain("alter publication supabase_realtime add table public.room_state_events");
    expect(realtime).toContain('table: "room_state_events"');
    expect(realtime).toContain("classifyRoomVersionEvent");
    expect(realtime).toContain("handlers.roomCheckpoint?.()");
    expect(realtime).toContain("handlers.roomEvent?.");
    expect(realtime).not.toContain("handlers.room?.({ room: payload.new })");

    const app = readFileSync("public/js/app.js", "utf8");
    expect(app).toContain("roomCheckpoint: () => ({");
    expect(app).toContain("roomId: state.room?.id");
    expect(app).toContain("version: state.room?.realtimeVersion");
  });
});
