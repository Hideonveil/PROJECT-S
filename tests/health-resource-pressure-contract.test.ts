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
});
