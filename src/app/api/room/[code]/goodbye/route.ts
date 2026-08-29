import { enrichRoom } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { mapSession, sessionForRoomCode } from "@/lib/session";
import { parseGoodbyeCommand } from "@/lib/session-goodbye";
import { supabaseAdmin } from "@/lib/supabase";
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
    const command = parseGoodbyeCommand(body);
    const current = await sessionForRoomCode(code);
    roomId = current.room_id;
    sessionId = current.id;
    const admin = supabaseAdmin();
    const { data: operation, error: rpcError } = await admin.rpc("execute_room_operation", {
      p_operation_id: idempotencyKey(request) || rid,
      p_action: "goodbye",
      p_room_id: current.room_id,
      p_actor_id: me.id,
      p_payload: command,
    });
    if (rpcError) throw rpcError;
    const { data: room, error: roomError } = await admin.from("rooms").select("*").eq("id", current.room_id).single();
    if (roomError) throw roomError;
    const enrichedRoom = await enrichRoom(room);
    return jsonOk(
      {
        room: enrichedRoom,
        session: mapSession(operation?.result as Session),
        goodbyeRequests: enrichedRoom.goodbyeRequests,
      },
      rid
    );
  } catch (error) {
    return errorResponse(error, rid, "拜拜状态更新失败，请稍后重试", {
      userId,
      roomId,
      sessionId,
      action: "goodbye",
      route: `/api/room/${code || ":code"}/goodbye`,
    });
  }
}
