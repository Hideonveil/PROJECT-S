import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  assertSafeOperation,
  buildReadOnlyPlan,
  dryRunPlan,
  parseArgs,
} from "../tools/capacity/runner.mjs";

const actors = Array.from({ length: 100 }, (_, index) => ({
  actorId: `capacity-${String(index + 1).padStart(3, "0")}`,
  userId: `user-${index + 1}`,
  mode: index % 4 === 0 ? "fragmented" : "ranked",
  profile: "template",
}));

describe("capacity runner safety contract", () => {
  it("defaults to a no-network dry run", () => {
    const options = parseArgs(["--run-id", "cap100-test"]);
    expect(options.mode).toBe("dry-run");
    expect(options.maxRps).toBe(DEFAULT_OPTIONS.maxRps);
    expect(dryRunPlan({ options, manifest: { actors } })).toMatchObject({ networkExecuted: false, statefulExecution: expect.stringContaining("not implemented") });
  });

  it("only permits fixed read paths and GET/HEAD in read-only mode", () => {
    expect(assertSafeOperation({ mode: "read-only", method: "GET", path: "/api/state" })).toMatchObject({ mutation: false });
    expect(() => assertSafeOperation({ mode: "read-only", method: "POST", path: "/api/online" })).toThrow(/forbidden/);
    expect(() => assertSafeOperation({ mode: "read-only", method: "GET", path: "/api/matchmaking/status" })).toThrow(/not allowlisted/);
  });

  it("builds a bounded 100-reader plan with health under ten percent", () => {
    const plan = buildReadOnlyPlan({ actors, maxUsers: 100, maxRequests: 600, runId: "cap100-test" });
    expect(plan.requests.length).toBeLessThanOrEqual(600);
    expect(plan.healthRatio).toBeLessThanOrEqual(0.1);
    expect(plan.perActorMaximum).toBeLessThanOrEqual(6);
    expect(plan.requests.some((request) => request.authenticated && request.path === "/api/state")).toBe(true);
  });

  it("requires an explicit production acknowledgement", () => {
    expect(() => parseArgs([
      "--execute-read-only",
      "--base-url", "https://www.jiyuan.online",
      "--run-id", "cap100-test",
      "--manifest", "manifest.json",
      "--max-users", "5",
      "--max-rps", "10",
      "--max-requests", "30",
    ])).toThrow(/allow-production/);
    expect(() => parseArgs([
      "--execute-read-only",
      "--base-url", "https://www.jiyuan.online",
      "--run-id", "cap100-test",
      "--manifest", "manifest.json",
      "--max-users", "5",
      "--max-rps", "10",
      "--max-requests", "30",
      "--allow-production",
      "--production-ack", "different-run",
    ])).toThrow(/production-ack/);
  });

  it("caps read-only burst requests and keeps stateful approval separate", () => {
    expect(() => parseArgs([
      "--execute-read-only",
      "--base-url", "http://127.0.0.1:3000",
      "--run-id", "cap100-test",
      "--manifest", "manifest.json",
      "--max-users", "100",
      "--max-rps", "10",
      "--max-requests", "601",
    ])).toThrow(/capped at 600/);
    expect(() => parseArgs([
      "--stateful",
      "--base-url", "http://127.0.0.1:3000",
      "--run-id", "cap100-test",
      "--manifest", "manifest.json",
      "--scenario", "scenario.json",
      "--max-users", "5",
      "--max-rps", "10",
      "--max-requests", "30",
    ])).toThrow(/stateful-approval/);
  });
});
