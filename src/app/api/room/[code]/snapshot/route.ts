import { activeRoomFor, createStateReadContext } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, jsonOk, requestId } from "@/lib/http";
import { liveRoomSnapshot } from "@/lib/room-snapshot";

/**
 * Read-only authoritative Room hydration endpoint. It deliberately resolves
 * the caller's active Room first, so an old member row or arbitrary room code
 * can never expose/reopen a historical Room.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);
    const code = (await params).code;
    const room = await activeRoomFor(profile.id, createStateReadContext());
    if (!room || room.code !== code) throw new AppError("ROOM_NOT_FOUND", "房间不存在或已结束", 404);
    const snapshot = liveRoomSnapshot(room);
    const response = jsonOk(snapshot, rid);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return errorResponse(error, rid, "房间状态获取失败");
  }
}
