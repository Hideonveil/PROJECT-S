import { poolCounts } from "@/lib/api";
import { errorResponse, jsonOk, requestId } from "@/lib/http";

function configured(name: string) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return Boolean(value && value !== "undefined" && value !== "null");
}

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
      feedbackEmailConfigured: configured("RESEND_API_KEY")
        && configured("FEEDBACK_TO_EMAIL")
        && configured("RESEND_FROM_EMAIL"),
      ...counts,
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "数据库暂时不可用");
  }
}
