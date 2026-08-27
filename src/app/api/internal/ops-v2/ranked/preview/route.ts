import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { previewRankedMatch } from "@/lib/ops-v2/interventions";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    return jsonOk({ preview: await previewRankedMatch(String(body.userA || ""), String(body.userB || "")) }, rid);
  } catch (error) { return errorResponse(error, rid, "预览 Ranked 人工匹配失败"); }
}
