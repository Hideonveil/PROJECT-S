import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Matcher event wake contract", () => {
  it("wakes on durable pool changes and retains a low-frequency safety sweep", () => {
    const scheduler = readFileSync("src/lib/matchmaking/scheduler.ts", "utf8");
    const wakeSource = readFileSync("src/lib/matchmaking/wake-source.ts", "utf8");
    expect(scheduler).toContain("export function wakeMatcherScheduler");
    expect(scheduler).toContain("safetySweepMs: 15_000");
    expect(scheduler).toContain("eventCoalesceMs: 100");
    expect(wakeSource).toContain('table: "matchmaking_tickets"');
    expect(wakeSource).toContain('table: "matchmaking_groups"');
    expect(wakeSource).toContain("onWake");
  });
});
