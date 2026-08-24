import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  assertSafeOperation,
  buildAuthManifest,
  buildReaderAllocation,
  buildReadOnlyPlan,
  normalizeStatefulCredentials,
  dryRunPlan,
  normalizeCredentials,
  parseArgs,
  readCredentialsFile,
  writeAuthManifest,
} from "../tools/capacity/runner.mjs";
import { buildStatefulPlan, statefulDryRunPlan } from "../tools/capacity/stateful-adapter.mjs";

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
    expect(dryRunPlan({ options, manifest: { actors } })).toMatchObject({ networkExecuted: false, statefulExecution: expect.stringContaining("5 -> 10 -> 20") });
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
    expect(plan.perReaderMaximum).toBeLessThanOrEqual(6);
    expect(plan.requests.some((request) => request.authenticated && request.path === "/api/state")).toBe(true);
  });

  it("allocates 100 virtual readers across three identities", () => {
    const identities = ["A", "B", "C"].map((identity) => ({ actorId: identity, userId: `user-${identity}` }));
    expect(buildReaderAllocation({ actors: identities, maxUsers: 100, readerAllocation: { A: 34, B: 33, C: 33 } })).toEqual([
      { actorId: "A", count: 34 },
      { actorId: "B", count: 33 },
      { actorId: "C", count: 33 },
    ]);
    const plan = buildReadOnlyPlan({ actors: identities, maxUsers: 100, maxRequests: 600, runId: "cap100-test", readerAllocation: { A: 34, B: 33, C: 33 } });
    expect(plan.maxUsers).toBe(100);
    expect(plan.perReaderMaximum).toBe(5);
    expect(plan.readerAllocation).toEqual({ A: 34, B: 33, C: 33 });
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

  it("requires a secure credential source for auth preparation", () => {
    expect(() => parseArgs([
      "--prepare-auth",
      "--base-url", "https://www.jiyuan.online",
      "--run-id", "cap-auth-test",
      "--manifest-out", "/private/tmp/cap-auth-manifest.json",
      "--allow-production",
      "--production-ack", "cap-auth-test",
    ])).toThrow(/auth-secret-file|auth-stdin/);
    expect(parseArgs([
      "--prepare-auth",
      "--base-url", "https://www.jiyuan.online",
      "--run-id", "cap-auth-test",
      "--auth-secret-file", "/private/tmp/cap-auth-secrets.json",
      "--manifest-out", "/private/tmp/cap-auth-manifest.json",
      "--allow-production",
      "--production-ack", "cap-auth-test",
    ])).toMatchObject({ mode: "auth-prepare", authSecretFile: "/private/tmp/cap-auth-secrets.json" });
  });

  it("accepts only distinct A/B/C credentials", () => {
    expect(normalizeCredentials({ identities: [
      { identity: "A", identifier: "a", password: "one" },
      { identity: "B", identifier: "b", password: "two" },
      { identity: "C", identifier: "c", password: "three" },
    ] })).toHaveLength(3);
    expect(() => normalizeCredentials({ identities: [
      { identity: "A", identifier: "a", password: "one" },
      { identity: "A", identifier: "b", password: "two" },
      { identity: "C", identifier: "c", password: "three" },
    ] })).toThrow(/distinct/);
  });

  it("validates the fixed 20-user stateful credential envelope", () => {
    const credentials = normalizeStatefulCredentials({ identities: Array.from({ length: 20 }, (_, index) => ({
      identity: `S${String(index + 1).padStart(2, "0")}`,
      identifier: `stateful-${index + 1}`,
      password: "not-written-to-evidence",
    })) });
    expect(credentials).toHaveLength(20);
    expect(() => normalizeStatefulCredentials({ identities: credentials.slice(0, 4) })).toThrow(/5 to 20/);
    expect(() => normalizeStatefulCredentials({ identities: [...credentials, { identity: "S21", identifier: "x", password: "y" }] })).toThrow(/5 to 20/);
  });

  it("builds only the approved 5 -> 10 -> 20 stateful stages", () => {
    const statefulActors = [
      { actorId: "R01", role: "ranked", mode: "ranked" },
      { actorId: "R02", role: "ranked", mode: "ranked" },
      { actorId: "C01", role: "casual", mode: "casual" },
      { actorId: "C02", role: "casual", mode: "casual" },
      { actorId: "C03", role: "casual", mode: "casual" },
      { actorId: "R03", role: "ranked", mode: "ranked" },
      { actorId: "R04", role: "ranked", mode: "ranked" },
      { actorId: "C04", role: "casual", mode: "casual" },
      { actorId: "C05", role: "casual", mode: "casual" },
      { actorId: "C06", role: "casual", mode: "casual" },
      ...Array.from({ length: 8 }, (_, index) => ({ actorId: `R${String(index + 5).padStart(2, "0")}`, role: "ranked", mode: "ranked" })),
      { actorId: "F01", role: "fragmented", mode: "fragmented" },
      { actorId: "F02", role: "fragmented", mode: "fragmented" },
    ];
    const plan = buildStatefulPlan({ actors: statefulActors, runId: "stateful-test", maxUsers: 20 });
    expect(plan.stages.map((stage) => stage.count)).toEqual([5, 10, 20]);
    expect(statefulDryRunPlan({ actors: statefulActors, runId: "stateful-test", maxUsers: 20 })).toMatchObject({ networkExecuted: false, safety: { rawSql: false, serviceRole: false, fixedSequence: "5 -> 10 -> 20" } });
  });

  it("reads 0600 secrets and writes a manifest without credentials", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "jiyuan-capacity-auth-"));
    const secretFile = path.join(directory, "secrets.json");
    const manifestFile = path.join(directory, "manifest.json");
    try {
      await writeFile(secretFile, JSON.stringify({ identities: [
        { identity: "A", identifier: "a", password: "one" },
        { identity: "B", identifier: "b", password: "two" },
        { identity: "C", identifier: "c", password: "three" },
      ] }), { mode: 0o600 });
      await chmod(secretFile, 0o600);
      const credentials = await readCredentialsFile(secretFile);
      expect(credentials.map((record) => record.identity)).toEqual(["A", "B", "C"]);
      const manifest = buildAuthManifest({ runId: "cap-auth-test", smoke: [
        { identity: "A", userId: "user-a", tokenExpiry: "2030-01-01T00:00:00.000Z" },
        { identity: "B", userId: "user-b", tokenExpiry: "2030-01-01T00:00:00.000Z" },
        { identity: "C", userId: "user-c", tokenExpiry: "2030-01-01T00:00:00.000Z" },
      ] });
      await writeAuthManifest(manifestFile, manifest);
      const output = JSON.parse(await readFile(manifestFile, "utf8"));
      expect(JSON.stringify(output)).not.toMatch(/password|access_token|refresh_token/i);
      expect(output.reader_allocation).toEqual({ A: 34, B: 33, C: 33 });
      expect((await stat(manifestFile)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
