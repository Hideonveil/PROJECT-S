import { describe, expect, it } from "vitest";
import { createRoomOperationTracker } from "../public/js/room-operation-tracker.js";

describe("Room operation tracker", () => {
  it("reuses one operation id while the same user intent is pending or unknown", () => {
    let sequence = 0;
    const tracker = createRoomOperationTracker({ createId: () => `operation-${++sequence}` });

    const first = tracker.begin("room-a", "goodbye", { requested: true });
    tracker.markUnknown(first);
    const retry = tracker.begin("room-a", "goodbye", { requested: true });

    expect(retry).toBe(first);
    expect(sequence).toBe(1);
  });

  it("creates a new operation for a genuinely different intent", () => {
    let sequence = 0;
    const tracker = createRoomOperationTracker({ createId: () => `operation-${++sequence}` });

    const stop = tracker.begin("room-a", "recruitment", { requested: true });
    const withdraw = tracker.begin("room-a", "recruitment", { requested: false });

    expect(withdraw).not.toBe(stop);
    expect(sequence).toBe(2);
  });

  it("forgets a completed or definitely failed operation", () => {
    let sequence = 0;
    const tracker = createRoomOperationTracker({ createId: () => `operation-${++sequence}` });

    const completed = tracker.begin("room-a", "exit", {});
    tracker.complete(completed);
    expect(tracker.begin("room-a", "exit", {})).not.toBe(completed);

    const failed = tracker.begin("room-a", "goodbye", { requested: true });
    tracker.fail(failed);
    expect(tracker.begin("room-a", "goodbye", { requested: true })).not.toBe(failed);
  });
});
