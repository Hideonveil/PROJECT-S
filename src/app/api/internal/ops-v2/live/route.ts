import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { resolveLiveOpsSnapshot } from "@/lib/ops-v2/read-model";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    return jsonOk({ live: await resolveLiveOpsSnapshot() }, rid);
  } catch (error) {
    return errorResponse(error, rid, "读取 LIVE 运营数据失败");
  }
}
