import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { cancelTicket } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    const ticket = await cancelTicket(profile.id, String(body.reason || "user_cancelled"), idempotencyKey(request));
    return jsonOk({ ticket }, rid);
  } catch (error) {
    return errorResponse(error, rid, "退出匹配失败");
  }
}
