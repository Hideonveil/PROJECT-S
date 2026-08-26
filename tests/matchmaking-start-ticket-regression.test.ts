import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("room-first ticket start regression", () => {
  it("keeps the waiting-room RPC JSON separate from a rooms row", () => {
    const migration = readFileSync(
      "supabase/migrations/20260826110000_fix_room_first_start_record.sql",
      "utf8",
    );
    expect(migration).toContain("v_room_json jsonb;");
    expect(migration).toContain("v_room_json := public.matchmaking_create_waiting_room");
    expect(migration).not.toContain("v_room := public.matchmaking_create_waiting_room");
  });
});
