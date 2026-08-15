import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { sessionForRoomCode } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  try {
    const { code } = await params;
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const session = await sessionForRoomCode(code);
    const { error: rpcError } = await admin.rpc("phase1_start_session", {
      p_session_id: session.id,
      p_actor_id: me.id,
      p_request_id: idempotencyKey(request),
    });
    if (rpcError) throw rpcError;
    const { data: room } = await admin.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
    return jsonOk({ room: await enrichRoom(room) }, rid);
  } catch (error) {
    return errorResponse(error, rid, "开始失败，请稍后重试");
  }
}
