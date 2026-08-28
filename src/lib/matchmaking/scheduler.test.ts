import { describe, expect, it } from "vitest";
import { MATCHER_SCHEDULER_POLICY, nextMatcherCooldownMs } from "./scheduler";

describe("matcher scheduler policy", () => {
  it("reserves bounded capacity for fresh and older tickets", () => {
    expect(MATCHER_SCHEDULER_POLICY).toMatchObject({
      freshBatchSize: 16,
      regularBatchSize: 4,
      processingConcurrency: 2,
      intervalMs: 2_000,
      intervalJitterMs: 500,
    });
  });

  it("backs off expected contention and quarantines repeated database errors", () => {
    expect(nextMatcherCooldownMs("BUSINESS_CONFLICT", 0, 0, () => 0)).toBe(1_000);
    expect(nextMatcherCooldownMs("WAITING", 0, 0, () => 0)).toBe(15_000);
    expect(nextMatcherCooldownMs("DATABASE_ERROR", 0, 0, () => 0)).toBe(30_000);
    expect(nextMatcherCooldownMs("DATABASE_ERROR", 0, 2, () => 0)).toBe(300_000);
  });
});
