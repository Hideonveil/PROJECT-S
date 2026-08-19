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

  it("sends contact reports straight to the protected OPS inbox without email", () => {
    const feedbackRoute = read("src/app/api/feedback/route.ts");
    const feedbackLib = read("src/lib/feedback.ts");
    const metricsRoute = read("src/app/api/ops/metrics/route.ts");
    const opsPage = read("src/app/ops/page.tsx");
    const homePage = read("public/js/pages/home.js");
    expect(homePage).toContain("match-contact");
    expect(homePage).toContain("open-feedback");
    expect(feedbackRoute).toContain("requireRequestProfile");
    expect(feedbackRoute).not.toContain("sendFeedbackEmail");
    expect(feedbackLib).toContain("10 到 500");
    expect(feedbackLib).not.toContain("Resend");
    expect(metricsRoute).toContain('.from("feedback")');
    expect(metricsRoute).not.toContain("current_page,current_game");
    expect(metricsRoute).toContain("recentFeedback");
    expect(opsPage).toContain("联系我们收件箱");
  });

  it("uses page lifecycle events instead of a timer for player presence", () => {
    const route = read("src/app/api/online/route.ts");
    const app = read("public/js/app.js");
    const api = read("public/js/api.js");
    expect(route).toContain("requireRequestProfile");
    expect(route).toContain("last_seen");
    expect(app).toContain("markPresenceOnline");
    expect(app).toContain('addEventListener("pageshow"');
    expect(app).toContain('addEventListener("pagehide"');
    expect(app).toContain("markPresenceOffline");
    expect(api).toContain("navigator.sendBeacon");
    expect(app).toContain("{ unloading: true }");
    expect(app).not.toContain("setInterval(beat");
  });

  it("keeps the account menu inside the persistent navigation shell", () => {
    const shell = read("public/js/ui.js");
    const app = read("public/js/app.js");
    expect(shell).toContain("data-account-popover");
    expect(shell).toContain("toggle-account-menu");
    expect(app).toContain("toggleProductAccountMenu");
    expect(app).toContain("is-account-menu-open");
  });

  it("keeps realtime state snapshots read-only to prevent request amplification", () => {
    const stateRoute = read("src/app/api/state/route.ts");
    const realtime = read("public/js/realtime.js");
    expect(stateRoute).toContain("matchmakingStatus(profile.id, false)");
    expect(stateRoute).not.toContain('update({ online: true');
    expect(realtime).not.toContain('table: "profiles"');
  });
});
