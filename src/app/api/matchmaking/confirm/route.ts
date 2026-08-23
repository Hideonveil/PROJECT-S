import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { confirmGroup, confirmPair } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    const decision = String(body.decision || "");
    if (body.groupId) {
      return jsonOk(await confirmGroup(profile.id, String(body.groupId), decision, idempotencyKey(request)), rid);
    }
    return jsonOk(await confirmPair(profile.id, String(body.pairId || ""), decision, idempotencyKey(request)), rid);
  } catch (error) {
    return errorResponse(error, rid, "匹配确认失败");
  }
}
