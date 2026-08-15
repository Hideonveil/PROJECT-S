import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { createPlayingRoom } from "@/lib/room";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const { data: application } = await admin
      .from("applications")
      .select("*")
      .eq("id", String(body.applicationId || ""))
      .maybeSingle();
    if (!application || application.to_user_id !== me.id) {
      return NextResponse.json({ error: "申请无效" }, { status: 400 });
    }
    if (!["pending", "accepted"].includes(application.status)) {
      return NextResponse.json({ error: "申请已处理" }, { status: 400 });
    }

    const room = await createPlayingRoom(application, me.id, idempotencyKey(request));
    return jsonOk({ room }, rid);
  } catch (error) {
    return errorResponse(error, rid, "接受失败，请稍后重试");
  }
}
