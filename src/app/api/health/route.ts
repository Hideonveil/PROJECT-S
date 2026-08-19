import { poolCounts } from "@/lib/api";
import { errorResponse, jsonOk, requestId } from "@/lib/http";

export async function GET(request: Request) {
  const rid = requestId(request);
  const startedAt = Date.now();
  try {
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
