import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { startGroup } from "@/lib/matchmaking/service";
import { markDeprecatedEndpoint } from "@/lib/deprecation";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    return markDeprecatedEndpoint(
      jsonOk(await startGroup(profile.id, String(body.groupId || ""), idempotencyKey(request)), rid),
      { route: "/api/matchmaking/group/start", replacement: "/api/room/:code/recruitment", requestId: rid },
    );
  } catch (error) {
    return errorResponse(error, rid, "无法以当前人数开始");
  }
}
