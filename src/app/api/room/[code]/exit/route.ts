import { requireRequestProfile } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { mapSession, sessionForRoomCode } from "@/lib/session";
import type { Session } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  let userId: string | null = null;
  let roomId: string | null = null;
  let sessionId: string | null = null;
  try {
    code = (await params).code;
    const body = await jsonBody(request);
    const me = await requireRequestProfile(request, body);
    userId = me.id;
    const admin = supabaseAdmin();
    const current = await sessionForRoomCode(code);
    roomId = current.room_id;
    sessionId = current.id;
    const { data: updatedSession, error: rpcError } = await admin.rpc("phase1_exit_room", {
      p_session_id: current.id,
      p_actor_id: me.id,
      p_request_id: idempotencyKey(request),
    });
    if (rpcError) throw rpcError;
    const { data: room } = await admin.from("rooms").select("*").eq("id", current.room_id).single();
    return jsonOk({
      room: await enrichRoom(room),
      session: mapSession(updatedSession as Session),
      exited: true,
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "退出失败，请稍后重试", {
      userId,
      roomId,
      sessionId,
      action: "leave",
      route: `/api/room/${code || ":code"}/exit`,
    });
  }
}
