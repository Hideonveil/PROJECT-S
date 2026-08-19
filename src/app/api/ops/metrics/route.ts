import { AppError, errorResponse, jsonOk, requestId } from "@/lib/http";
import { isOpsRequestAuthorized } from "@/lib/ops";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    if (!isOpsRequestAuthorized(request)) {
      throw new AppError("OPS_UNAUTHORIZED", "没有权限查看运营数据", 401);
    }
    const rawDays = Number(new URL(request.url).searchParams.get("days") || 14);
    const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : 14));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const admin = supabaseAdmin();
    const [snapshotResult, seriesResult, errorsResult] = await Promise.all([
      admin.rpc("ops_mvp_snapshot", { p_since: since }),
      admin.rpc("ops_mvp_daily_series", { p_since: since }),
      admin
        .from("product_events")
        .select("event_name,request_id,properties,occurred_at")
        .in("event_name", ["client_error", "server_error"])
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(20),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (seriesResult.error) throw seriesResult.error;
    if (errorsResult.error) throw errorsResult.error;
    return jsonOk({
      days,
      metrics: snapshotResult.data || {},
      series: seriesResult.data || [],
      recentErrors: errorsResult.data || [],
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "读取运营数据失败");
  }
}
