import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = vi.hoisted(() => vi.fn());

vi.mock("./supabase", () => ({ supabaseAdmin }));

import { clearPoolSummaryCache, poolSummary } from "./api";

function queryFor(table: string) {
  const response = table === "sessions"
    ? { data: [], count: null, error: null }
    : { data: null, count: 1, error: null };
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    then: (resolve: (value: typeof response) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return query;
}

describe("pool summary cache", () => {
  beforeEach(() => {
    clearPoolSummaryCache();
    supabaseAdmin.mockImplementation(() => ({
      from: (table: string) => queryFor(table),
    }));
  });

  it("reuses a successful summary within the short cache window", async () => {
    const first = await poolSummary();
    const second = await poolSummary();

    expect(first).toEqual({ online: 1, matching: 1, users: 1, playing: 0 });
    expect(second).toEqual(first);
    expect(supabaseAdmin).toHaveBeenCalledTimes(4);
  });
});
