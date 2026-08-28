import { enrichRoom } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  try {
    code = (await params).code;
    const body = await jsonBody(request);
    if (typeof body.requested !== "boolean") throw new AppError("RECRUITMENT_VOTE_INVALID", "请选择是否停止招募", 422);
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const { data: room, error: roomError } = await admin.from("rooms").select("*").eq("code", code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "房间不存在", 404);
    const { data: vote, error: voteError } = await admin.rpc("toggle_room_recruitment_vote", {
      p_room_id: room.id,
      p_actor_id: me.id,
      p_requested: body.requested,
      p_request_id: idempotencyKey(request),
    });
    if (voteError) throw voteError;
    const { data: latest, error: latestError } = await admin.from("rooms").select("*").eq("id", room.id).single();
    if (latestError) throw latestError;
    return jsonOk({ room: await enrichRoom(latest), recruitment: vote }, rid);
  } catch (error) {
    return errorResponse(error, rid, "停止招募状态更新失败，请稍后重试", { action: "recruitment_vote", route: `/api/room/${code || ":code"}/recruitment` });
  }
}
