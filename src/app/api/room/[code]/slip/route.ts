import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { mapSession, sessionForRoomCode } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  try {
    code = (await params).code;
    const body = await jsonBody(request);
    const me = await requireRequestProfile(request, body);
    const current = await sessionForRoomCode(code);
    if (!current) throw new AppError("SESSION_NOT_FOUND", "当前没有可以离开的 Session", 404);
    const { data, error } = await supabaseAdmin().rpc("phase1_slip_room", {
      p_session_id: current.id,
      p_actor_id: me.id,
      p_request_id: idempotencyKey(request),
    });
    if (error) throw error;
    return jsonOk({ session: mapSession(data as Session), slipped: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "溜了状态更新失败，请稍后重试", { action: "slip", route: `/api/room/${code || ":code"}/slip` });
  }
}
