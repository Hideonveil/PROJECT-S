import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { confirmPair } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const profile = await requireRequestProfile(request, body);
    return jsonOk(await confirmPair(profile.id, String(body.pairId || ""), String(body.decision || ""), idempotencyKey(request)), rid);
  } catch (error) {
    return errorResponse(error, rid, "匹配确认失败");
  }
}
