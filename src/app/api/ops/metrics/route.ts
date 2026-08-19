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
    const { data, error } = await supabaseAdmin().rpc("ops_mvp_snapshot", { p_since: since });
    if (error) throw error;
    return jsonOk({ days, metrics: data || {} }, rid);
  } catch (error) {
    return errorResponse(error, rid, "读取运营数据失败");
  }
}

