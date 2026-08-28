import { describe, expect, it } from "vitest";
import { MatcherAttemptContext } from "./attempt-context";

describe("matcher attempt context", () => {
  it("owns success and waiting transitions", () => {
    const waiting = new MatcherAttemptContext("tick-1", "ticket-1");
    waiting.markWaiting();
    expect(waiting.outcome).toBe("WAITING");

    const success = new MatcherAttemptContext("tick-2", "ticket-2");
    success.markSuccess("candidate-2");
    success.markSuccess();
    expect(success.outcome).toBe("SUCCESS");
    expect(success.targetId).toBe("candidate-2");
    expect(success.reasonCode).toBeNull();
  });

  it("owns business-conflict and database-error classification", () => {
    const conflict = new MatcherAttemptContext("tick-3", "ticket-3");
    conflict.recordBusinessConflict("GROUP_FULL", "group-3");
    expect(conflict.outcome).toBe("BUSINESS_CONFLICT");
    expect(conflict.reasonCode).toBe("GROUP_FULL");
    expect(conflict.targetId).toBe("group-3");
    expect(conflict.conflictCount).toBe(1);

    const databaseError = new MatcherAttemptContext("tick-4", "ticket-4");
    databaseError.recordDatabaseError({ code: "40001" });
    expect(databaseError.outcome).toBe("DATABASE_ERROR");
    expect(databaseError.reasonCode).toBe("DATABASE_SERIALIZATION_FAILURE");
  });
});
