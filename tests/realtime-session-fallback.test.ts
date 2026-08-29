import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getState = vi.fn();
const getSupabaseClient = vi.fn();

vi.mock("../public/js/api.js?v=20260828-peer-sync-01", () => ({
  getState,
  getSupabaseClient,
}));

describe("Realtime session hydration fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getState.mockReset();
    getSupabaseClient.mockReset();
    getState.mockResolvedValue({ room: { id: "room-1", code: "ROOM-1" } });
    getSupabaseClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("falls back to authoritative state polling when browser auth hydration has not produced a session", async () => {
    const { openRealtime } = await import("../public/js/realtime.js");
    const hello = vi.fn();
    const checkpoint = vi.fn().mockReturnValue(7);

    const close = await openRealtime({ hello, checkpoint, connection: vi.fn() });
    await vi.advanceTimersByTimeAsync(1);

    expect(getState).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(hello).toHaveBeenCalledWith(
      { room: { id: "room-1", code: "ROOM-1" } },
      { observedGeneration: 7 },
    );
    close();
  });
});
