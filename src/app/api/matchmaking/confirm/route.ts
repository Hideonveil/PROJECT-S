import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { confirmGroup, confirmPair } from "@/lib/matchmaking/service";
import { markDeprecatedEndpoint } from "@/lib/deprecation";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    const decision = String(body.decision || "");
    if (body.groupId) {
      return markDeprecatedEndpoint(
        jsonOk(await confirmGroup(profile.id, String(body.groupId), decision, idempotencyKey(request)), rid),
        { route: "/api/matchmaking/confirm", replacement: "/api/room/:code/recruitment", requestId: rid },
      );
    }
    return markDeprecatedEndpoint(
      jsonOk(await confirmPair(profile.id, String(body.pairId || ""), decision, idempotencyKey(request)), rid),
      { route: "/api/matchmaking/confirm", replacement: "/api/room/:code/snapshot", requestId: rid },
    );
  } catch (error) {
    return errorResponse(error, rid, "匹配确认失败");
  }
}
