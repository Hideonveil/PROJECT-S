import { poolCounts } from "@/lib/api";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { reconcileStalePresence } from "@/lib/presence";

export async function GET(request: Request) {
  const rid = requestId(request);
  const startedAt = Date.now();
  try {
    // Request-triggered fallback for deployments without a separate scheduler.
    // The database function is bounded and idempotent; heartbeat requests also
    // invoke it, so this does not make health the sole cleanup path.
    await reconcileStalePresence().catch(() => null);
    const counts = await poolCounts();
    return jsonOk({
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      databaseLatencyMs: Date.now() - startedAt,
      version: process.env.APP_VERSION || "development",
      ...counts,
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "数据库暂时不可用");
  }
}
