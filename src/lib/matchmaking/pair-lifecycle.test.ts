import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  pair: null as Record<string, unknown> | null,
  rpc: vi.fn(),
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: database.pair, error: null }),
        }),
      }),
    }),
    rpc: database.rpc,
  }),
}));

import { autoConnectPair, autoConnectRequestId } from "./pair-lifecycle";

describe("Ranked pair lifecycle", () => {
  beforeEach(() => {
    database.pair = null;
    database.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it("builds a stable request id from the two reserved tickets", () => {
    expect(autoConnectRequestId("ticket-a", "ticket-b")).toBe("auto-pair:ticket-a:ticket-b");
  });

  it("confirms both participants through the canonical pair RPC", async () => {
    database.pair = {
      id: "pair-1",
      user_a_id: "user-a",
      user_b_id: "user-b",
      state: "waiting_confirmation",
    };

    await autoConnectPair("pair-1", "request-1");

    expect(database.rpc).toHaveBeenNthCalledWith(1, "matchmaking_confirm_pair", {
      p_pair_id: "pair-1",
      p_user_id: "user-a",
      p_decision: "accepted",
      p_request_id: "request-1:user-a",
    });
    expect(database.rpc).toHaveBeenNthCalledWith(2, "matchmaking_confirm_pair", {
      p_pair_id: "pair-1",
      p_user_id: "user-b",
      p_decision: "accepted",
      p_request_id: "request-1:user-b",
    });
  });

  it("does not re-confirm a pair that is already connected", async () => {
    database.pair = { id: "pair-1", state: "matched" };

    await autoConnectPair("pair-1");

    expect(database.rpc).not.toHaveBeenCalled();
  });
});
