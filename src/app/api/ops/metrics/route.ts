import { AppError, errorResponse, jsonOk, requestId } from "@/lib/http";
import { isOpsRequestAuthorized } from "@/lib/ops";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    if (!(await isOpsRequestAuthorized(request))) {
      throw new AppError("OPS_UNAUTHORIZED", "没有权限查看运营数据", 401);
    }
    const rawDays = Number(new URL(request.url).searchParams.get("days") || 14);
    const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : 14));
    const rangeSince = new Date(Date.now() - days * 86_400_000).toISOString();
    const admin = supabaseAdmin();
    const resetResult = await admin
      .from("product_events")
      .select("occurred_at,properties")
      .eq("event_name", "ops_metrics_reset")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (resetResult.error) throw resetResult.error;
    const latestReset = (resetResult.data || []).reduce((latest, item) => {
      const itemSetAt = String((item.properties as Record<string, unknown> | null)?.setAt || item.occurred_at || "");
      const latestSetAt = String((latest?.properties as Record<string, unknown> | null)?.setAt || latest?.occurred_at || "");
      return !latest || itemSetAt > latestSetAt ? item : latest;
    }, null as { occurred_at?: string; properties?: Record<string, unknown> | null } | null);
    const baselineResetAt = String(
      latestReset?.properties?.metricsSince || latestReset?.occurred_at || "",
    ) || null;
    const since = baselineResetAt && new Date(baselineResetAt) > new Date(rangeSince)
      ? baselineResetAt
      : rangeSince;
    const [snapshotResult, seriesResult, errorsResult, feedbackResult] = await Promise.all([
      admin.rpc("ops_mvp_snapshot", { p_since: since }),
      admin.rpc("ops_mvp_daily_series", { p_since: since }),
      admin
        .from("product_events")
        .select("event_name,request_id,properties,occurred_at")
        .in("event_name", ["client_error", "server_error"])
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(20),
      admin
        .from("feedback")
        .select("id,username,feedback_type,content,contact_email,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (seriesResult.error) throw seriesResult.error;
    if (errorsResult.error) throw errorsResult.error;
    if (feedbackResult.error) throw feedbackResult.error;
    return jsonOk({
      days,
      metricsSince: since,
      baselineResetAt,
      metrics: snapshotResult.data || {},
      series: seriesResult.data || [],
      recentErrors: errorsResult.data || [],
      recentFeedback: feedbackResult.data || [],
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "读取运营数据失败");
  }
}
