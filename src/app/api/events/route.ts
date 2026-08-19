import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, jsonOk, requestId } from "@/lib/http";
import { CLIENT_EVENT_NAMES, safeEventProperties, trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  const traceId = requestId(request);
  try {
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const eventName = String(body.eventName || "");
    if (!CLIENT_EVENT_NAMES.has(eventName)) {
      throw new AppError("EVENT_NOT_ALLOWED", "这个埋点事件不允许由客户端提交", 422);
    }
    const properties = safeEventProperties(body.properties);
    await trackEvent({ eventName, userId: me.id, requestId: traceId, properties });
    return jsonOk({ ok: true }, traceId);
  } catch (error) {
    return errorResponse(error, traceId, "记录事件失败");
  }
}
