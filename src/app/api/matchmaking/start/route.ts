import { requireRequestProfile } from "@/lib/auth";
import { activeRoomShellFor } from "@/lib/api";
import { AppError, errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { normalizeMatchmakingInput } from "@/lib/matchmaking/rules";
import { startTicket } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    const matchBody = body.match && typeof body.match === "object" && !Array.isArray(body.match)
      ? body.match as Record<string, unknown>
      : {};
    const input = normalizeMatchmakingInput(matchBody);
    if (input.mode === "ranked" && matchBody.rankCode && !input.rankCode) {
      throw new AppError("RANK_INVALID", "当前段位无效，请重新选择", 422);
    }
    if (input.mode === "ranked" && !input.rankCode) {
      throw new AppError("RANK_REQUIRED", "天梯匹配必须选择当前段位", 422);
    }
    const matchmaking = await startTicket(profile.id, input, idempotencyKey(request));
    const room = matchmaking.ticket ? await activeRoomShellFor(profile.id) : null;
    return jsonOk({ ...matchmaking, room }, rid);
  } catch (error) {
    return errorResponse(error, rid, "进入匹配池失败，请稍后重试");
  }
}
