import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("P1 operations contract", () => {
  it("keeps raw funnel counts behind a service-role-only RPC", () => {
    const sql = read("supabase/migrations/0013_p1_operations.sql");
    expect(sql).toContain("ops_mvp_snapshot");
    expect(sql).toContain("revoke all on function public.ops_mvp_snapshot");
    expect(sql).toContain("grant execute on function public.ops_mvp_snapshot");
    expect(sql).toContain("searchesStarted");
    expect(sql).toContain("sessionsCompleted");
  });

  it("protects the metrics endpoint with an operations token", () => {
    const route = read("src/app/api/ops/metrics/route.ts");
    expect(route).toContain("isOpsRequestAuthorized");
    expect(route).toContain("Math.min(90");
  });

  it("provides a private dashboard with raw daily trends and recent errors", () => {
    const sql = read("supabase/migrations/0014_ops_dashboard.sql");
    const page = read("src/app/ops/page.tsx");
    expect(sql).toContain("ops_mvp_daily_series");
    expect(sql).toContain("grant execute on function public.ops_mvp_daily_series");
    expect(page).toContain("匹配机器，正在怎么转");
    expect(page).toContain("/api/ops/session");
  });

  it("records client and server failures without exposing direct table writes", () => {
    const metrics = read("src/lib/metrics.ts");
    const app = read("public/js/app.js");
    expect(metrics).toContain('eventName: "server_error"');
    expect(app).toContain('api.trackEvent("client_error"');
  });
});
