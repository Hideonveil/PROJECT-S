import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { forceRankedMatch } from "@/lib/ops-v2/interventions";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    return jsonOk({ result: await forceRankedMatch({ operator: actor.operator, userA: String(body.userA || ""), userB: String(body.userB || ""), reason: String(body.reason || ""), requestId: rid }) }, rid);
  } catch (error) { return errorResponse(error, rid, "执行 Ranked 人工匹配失败"); }
}
