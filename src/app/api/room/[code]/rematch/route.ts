import { requireRequestProfile } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { AppError, errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { mapSession, sessionForRoomCode } from "@/lib/session";
import type { Session } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  try {
    const { code } = await params;
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const session = await sessionForRoomCode(code);
    const choice = String(body.choice || "");
    if (!["yes", "no"].includes(choice)) {
      throw new AppError("REMATCH_CHOICE_INVALID", "请选择继续或结束", 422);
    }
    const { data: result, error: rpcError } = await admin.rpc("phase1_submit_rematch", {
      p_session_id: session.id,
      p_actor_id: me.id,
      p_choice: choice,
      p_request_id: idempotencyKey(request),
    });
    if (rpcError) throw rpcError;
    const { data: updated } = await admin.from("sessions").select("*").eq("id", session.id).single();
    let room = null;
    if (result?.roomId) {
      const { data: createdRoom } = await admin.from("rooms").select("*").eq("id", result.roomId).single();
      if (createdRoom) room = await enrichRoom(createdRoom);
    }
    return jsonOk({
      session: mapSession(updated as Session),
      resolution: result?.resolution || "waiting",
      room,
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "操作失败，请稍后重试");
  }
}
