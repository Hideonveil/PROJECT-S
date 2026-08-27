import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { lockCasualRoom } from "@/lib/ops-v2/interventions";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    return jsonOk({ result: await lockCasualRoom({ operator: actor.operator, groupId: String(body.groupId || ""), reason: String(body.reason || ""), requestId: rid }) }, rid);
  } catch (error) { return errorResponse(error, rid, "停止休闲 Room 招募失败"); }
}
