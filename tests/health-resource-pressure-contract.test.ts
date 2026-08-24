import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(`${root}/${file}`, "utf8");

describe("resource-pressure minimum safe fix", () => {
  it("keeps liveness independent from Supabase and makes the monitor use it", () => {
    const live = read("src/app/api/health/live/route.ts");
    const monitor = read("deploy/china-hk/monitor.sh");
    expect(live).toContain('status: "live"');
    expect(live).not.toContain("supabase");
    expect(monitor).toContain("/api/health/live");
    expect(monitor).not.toContain('"${PUBLIC_URL}/api/health"');
  });

  it("keeps public activity counts and directory reads off readiness health", () => {
    const api = read("public/js/api.js");
    const app = read("public/js/app.js");
    const summary = read("src/app/api/pool-summary/route.ts");
    const directory = read("src/app/api/public-directory/route.ts");
    expect(api).toContain('request("/api/pool-summary")');
    expect(api).toContain('request("/api/public-directory")');
    expect(app).not.toContain("snapshot = await api.health()");
    expect(app).not.toContain('fetch("/api/health"');
    expect(summary).toContain("poolSummary()");
    expect(directory).toContain("publicDirectory()");
  });

  it("keeps health checks read-only and abortable", () => {
    const health = read("src/lib/health.ts");
    const presence = read("src/lib/presence.ts");
    expect(health).toContain("probePresence");
    expect(health).toContain("AbortController");
    expect(health).toContain("poolSummary");
    expect(health).not.toContain("reconcileStalePresence");
    expect(presence).toContain("probePresence");
    expect(presence).toContain("presence_reconcile_stale");
  });

  it("keeps state hydration on the cached light summary and directory separate", () => {
    const api = read("src/lib/api.ts");
    const state = read("src/app/api/state/route.ts");
    expect(api).toContain("POOL_SUMMARY_CACHE_MS = 7_500");
    expect(api).toContain("export async function poolSummary");
    expect(state).toContain("poolSummary()");
    expect(state).not.toContain("poolCounts()");
    const loader = api.slice(api.indexOf("async function loadPoolSummary"), api.indexOf("export async function poolSummary"));
    expect(loader).not.toContain("publicMatchDirectory");
  });

  it("shares active room discovery and public profile reads within one state snapshot", () => {
    const api = read("src/lib/api.ts");
    const state = read("src/app/api/state/route.ts");
    const data = read("src/lib/data.ts");
    expect(api).toContain("createStateReadContext");
    expect(api).toContain("activeRoomCandidate");
    expect(state).toContain("const readContext = createStateReadContext()");
    expect(data).toContain("createReadContext");
    expect(data).toContain("context?.publicProfiles");
  });

  it("deduplicates overlapping authenticated state requests in the browser", () => {
    const api = read("public/js/api.js");
    const realtime = read("public/js/realtime.js");
    expect(api).toContain("let stateRequest = null");
    expect(api).toContain('authedRequest("/api/state")');
    expect(realtime).toContain("getState()");
  });
});
