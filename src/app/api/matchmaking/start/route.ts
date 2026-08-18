import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { normalizeMatchmakingInput } from "@/lib/matchmaking/rules";
import { startTicket } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const profile = await requireRequestProfile(request, body);
    const input = normalizeMatchmakingInput(body.match || {});
    if (input.mode === "ranked" && !input.rankCode) {
      throw new AppError("RANK_REQUIRED", "天梯匹配必须选择当前段位", 422);
    }
    return jsonOk(await startTicket(profile.id, input, idempotencyKey(request)), rid);
  } catch (error) {
    return errorResponse(error, rid, "进入匹配池失败，请稍后重试");
  }
}
