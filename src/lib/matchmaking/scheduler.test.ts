import { describe, expect, it } from "vitest";
import { createMatcherAttemptContext } from "./attempt-context";
import {
  MATCHER_SCHEDULER_POLICY,
  buildMatchAttemptState,
  combineMatcherQueues,
  nextMatcherCooldownMs,
  nextMatcherIntervalMs,
  runBoundedMatcherRows,
} from "./scheduler";

describe("matcher scheduler policy", () => {
  it("reserves bounded capacity for fresh and older tickets", () => {
    expect(MATCHER_SCHEDULER_POLICY).toMatchObject({
      freshBatchSize: 16,
      regularBatchSize: 4,
      processingConcurrency: 2,
      eventCoalesceMs: 100,
      safetySweepMs: 15_000,
      safetySweepJitterMs: 2_000,
    });
  });

  it("backs off expected contention and quarantines repeated database errors", () => {
    expect(nextMatcherCooldownMs("BUSINESS_CONFLICT", 0, 0, () => 0)).toBe(1_000);
    expect(nextMatcherCooldownMs("WAITING", 0, 0, () => 0)).toBe(15_000);
    expect(nextMatcherCooldownMs("DATABASE_ERROR", 0, 0, () => 0)).toBe(30_000);
    expect(nextMatcherCooldownMs("DATABASE_ERROR", 0, 2, () => 0)).toBe(300_000);
  });

  it("schedules every recurring sweep with bounded jitter", () => {
    expect(nextMatcherIntervalMs(() => 0)).toBe(15_000);
    expect(nextMatcherIntervalMs(() => 0.999)).toBe(16_998);
  });

  it("processes both fresh and regular queues with bounded concurrency", async () => {
    const rows = combineMatcherQueues(["fresh-a", "fresh-b"], ["regular-a", "regular-b"]);
    let active = 0;
    let peak = 0;
    const processed: string[] = [];
    await runBoundedMatcherRows(rows, 2, async (row) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      processed.push(row);
      active -= 1;
    });
    expect(new Set(processed)).toEqual(new Set(rows));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("builds durable cooldown and quarantine state from the attempt outcome", () => {
    const conflict = createMatcherAttemptContext("tick-1", "ticket-1");
    conflict.recordBusinessConflict("GROUP_RESERVATION_CONFLICT", "group-1");
    const conflictState = buildMatchAttemptState({
      id: "ticket-1", user_id: "user-1", mode: "casual", state: "searching", consecutive_conflicts: 1,
    }, conflict, 1_000, () => 0);
    expect(conflictState.patch).toMatchObject({
      last_match_outcome: "BUSINESS_CONFLICT",
      last_match_target_id: "group-1",
      consecutive_conflicts: 2,
      next_match_attempt_at: new Date(3_000).toISOString(),
    });

    const databaseError = createMatcherAttemptContext("tick-2", "ticket-2");
    databaseError.recordDatabaseError({ code: "40001", message: "serialization failure" });
    const errorState = buildMatchAttemptState({
      id: "ticket-2", user_id: "user-2", mode: "ranked", state: "searching", consecutive_match_errors: 2,
    }, databaseError, 1_000, () => 0);
    expect(errorState.quarantined).toBe(true);
    expect(errorState.patch).toMatchObject({
      last_match_outcome: "DATABASE_ERROR",
      consecutive_match_errors: 3,
      matcher_quarantined_at: new Date(1_000).toISOString(),
    });
  });
});
