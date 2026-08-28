import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{ table: string; filters: Array<[string, ...unknown[]]> }>,
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let operation = "select";
      let payload: Record<string, unknown> = {};
      let head = false;
      const filters: Array<[string, ...unknown[]]> = [];
      const builder: Record<string, any> = {
        select(_columns: string, options?: { head?: boolean }) { head = options?.head === true; return builder; },
        update(next: Record<string, unknown>) { operation = "update"; payload = next; return builder; },
        eq(...args: unknown[]) { filters.push(["eq", ...args]); return builder; },
        in(...args: unknown[]) { filters.push(["in", ...args]); return builder; },
        or(...args: unknown[]) { filters.push(["or", ...args]); return builder; },
        gte(...args: unknown[]) { filters.push(["gte", ...args]); return builder; },
        order(...args: unknown[]) { filters.push(["order", ...args]); return builder; },
        limit(...args: unknown[]) { filters.push(["limit", ...args]); return builder; },
        then(resolve: (value: unknown) => void) {
          database.queries.push({ table, filters: [...filters] });
          if (operation === "update") {
            database.updates.push(payload);
            return Promise.resolve({ error: null }).then(resolve);
          }
          if (head) return Promise.resolve({ count: 0, data: [], error: null }).then(resolve);
          const isFresh = filters.some(([name]) => name === "gte");
          const isRegular = filters.filter(([name]) => name === "or").length === 2;
          if (table === "matchmaking_tickets" && isFresh) {
            return Promise.resolve({ data: [{ id: "fresh-1", user_id: "user-f", mode: "ranked", state: "searching" }], error: null }).then(resolve);
          }
          if (table === "matchmaking_tickets" && isRegular) {
            return Promise.resolve({ data: [{ id: "regular-1", user_id: "user-r", mode: "casual", state: "searching" }], error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));

vi.mock("./runtime-telemetry", () => ({
  claimMatcherLease: vi.fn().mockResolvedValue(true),
  flushMatcherTelemetry: vi.fn(),
  increment: vi.fn(),
  markActiveTick: vi.fn(),
  matcherCircuitOpen: vi.fn().mockReturnValue(false),
  nextMatcherTick: vi.fn().mockReturnValue("tick-1"),
  observeLatency: vi.fn(),
  recordMatcherEvent: vi.fn(),
  recordTicketProcessed: vi.fn(),
  setGauge: vi.fn(),
}));

import { runMatchmakingSweep } from "./scheduler";

describe("matcher scheduler wiring", () => {
  beforeEach(() => {
    database.updates.length = 0;
    database.queries.length = 0;
  });

  it("queries and processes both fresh and regular tickets, then persists cooldown state", async () => {
    const processed: string[] = [];
    await runMatchmakingSweep(async (row, context) => {
      processed.push(row.id);
      context.markWaiting();
      return row;
    });

    expect(processed).toEqual(["fresh-1", "regular-1"]);
    expect(database.queries.some((query) => query.filters.some(([name]) => name === "gte"))).toBe(true);
    expect(database.queries.some((query) => query.filters.filter(([name]) => name === "or").length === 2)).toBe(true);
    expect(database.updates).toHaveLength(2);
    expect(database.updates.every((update) => update.last_match_outcome === "WAITING" && Boolean(update.next_match_attempt_at))).toBe(true);
  });
});
