import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { previewCasualAttach } from "@/lib/ops-v2/interventions";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    return jsonOk({ preview: await previewCasualAttach(String(body.userId || ""), String(body.groupId || "")) }, rid);
  } catch (error) { return errorResponse(error, rid, "Casual 人工附加暂未就绪"); }
}
