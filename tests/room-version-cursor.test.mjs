import { describe, expect, it } from "vitest";
import { classifyRoomVersionEvent } from "../public/js/room-version-cursor.js";

describe("Room version cursor", () => {
  it("ignores stale or duplicate Room events", () => {
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: 5 }, { room_id: "room-a", room_version: 4 })).toBe("ignore");
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: 5 }, { room_id: "room-a", room_version: 5 })).toBe("ignore");
  });

  it("refreshes once for the next version and fully resyncs after a gap", () => {
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: 5 }, { room_id: "room-a", room_version: 6 })).toBe("refresh");
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: 5 }, { room_id: "room-a", room_version: 8 })).toBe("resync");
  });

  it("ignores events for another Room and resyncs when no cursor exists", () => {
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: 5 }, { room_id: "room-b", room_version: 6 })).toBe("ignore");
    expect(classifyRoomVersionEvent({ roomId: "room-a", version: null }, { room_id: "room-a", room_version: 1 })).toBe("resync");
  });
});
