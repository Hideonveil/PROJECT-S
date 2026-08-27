import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { attachCasualUser } from "@/lib/ops-v2/interventions";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    return jsonOk({ result: await attachCasualUser({ operator: actor.operator, userId: String(body.userId || ""), groupId: String(body.groupId || ""), reason: String(body.reason || "") }) }, rid);
  } catch (error) { return errorResponse(error, rid, "Casual 人工附加暂未就绪"); }
}
