import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { resolveUserLifecycle } from "@/lib/ops-v2/read-model";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    const lifecycle = await resolveUserLifecycle((await context.params).userId);
    return jsonOk({ lifecycle }, rid);
  } catch (error) { return errorResponse(error, rid, "读取用户生命周期失败"); }
}
