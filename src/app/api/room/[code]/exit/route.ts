import { requireRequestProfile } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { exitPreSessionRoom } from "@/lib/matchmaking/service";
import { supabaseAdmin } from "@/lib/supabase";
import { AppError, errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { mapSession } from "@/lib/session";
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
    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "房间不存在", 404);
    roomId = room.id;

    const { data: currentSession, error: sessionError } = await admin
      .from("sessions")
      .select("*")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;

    // Room-first creates the shared Room before Session. In that phase the
    // user's normal leave action must cancel recruitment, not call a
    // Session-only RPC that cannot find a Session yet.
    if (!currentSession) {
      await exitPreSessionRoom(me.id, room.id, idempotencyKey(request));
      return jsonOk({
        // The actor has left. Remaining members receive their updated Room via
        // Realtime/state; rehydrating that old Room for the departed actor can
        // only create a false failure after the mutation already committed.
        room: null,
        session: null,
        exited: true,
      }, rid);
    }

    sessionId = currentSession.id;
    const { data: operation, error: rpcError } = await admin.rpc("execute_room_operation", {
      p_operation_id: idempotencyKey(request) || rid,
      p_action: "exit",
      p_room_id: room.id,
      p_actor_id: me.id,
      p_payload: {},
    });
    if (rpcError) throw rpcError;
    return jsonOk({
      room: await enrichRoom(room, { resumeEligible: false }),
      session: mapSession(operation?.result as Session),
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
