import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { matchmakingStatus } from "@/lib/matchmaking/service";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);
    return jsonOk(await matchmakingStatus(profile.id), rid);
  } catch (error) {
    return errorResponse(error, rid, "匹配状态同步失败");
  }
}
