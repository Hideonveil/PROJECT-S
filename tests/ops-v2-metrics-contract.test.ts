import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 metrics bridge", () => {
  it("exposes protected Prometheus facts without a mutation path", () => {
    const path = "src/app/api/internal/ops-v2/metrics/route.ts";
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain("requireOpsMetricsAuthorization");
    expect(source).toContain("matchmaking_runtime_minute");
    expect(source).toContain("jiyuan_matcher_attempts_total");
    expect(source).toContain("jiyuan_matcher_actual_sql_40001_total");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(source).not.toContain("export async function POST");
  });
});
