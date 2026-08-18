import { enrichRoom } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { mapSession, sessionForRoomCode } from "@/lib/session";
import { parseGoodbyeCommand } from "@/lib/session-goodbye";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  try {
    const { code } = await params;
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const command = parseGoodbyeCommand(body);
    const current = await sessionForRoomCode(code);
    const admin = supabaseAdmin();
    const { data: updatedSession, error: rpcError } = await admin.rpc("phase1_request_goodbye", {
      p_session_id: current.id,
      p_actor_id: me.id,
      p_requested: command.requested,
      p_request_id: rid,
    });
    if (rpcError) throw rpcError;
    const { data: room, error: roomError } = await admin.from("rooms").select("*").eq("id", current.room_id).single();
    if (roomError) throw roomError;
    const enrichedRoom = await enrichRoom(room);
    return jsonOk(
      {
        room: enrichedRoom,
        session: mapSession(updatedSession as Session),
        goodbyeRequests: enrichedRoom.goodbyeRequests,
      },
      rid
    );
  } catch (error) {
    return errorResponse(error, rid, "拜拜状态更新失败，请稍后重试");
  }
}
