import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json();
    const token = String(body.token || "");
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: me } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data: room } = await admin.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
    const { data: member } = await admin.from("room_members").select("id").eq("room_id", room.id).eq("user_id", me.id).maybeSingle();
    if (!member) return NextResponse.json({ error: "你不在这个房间" }, { status: 403 });

    if (room.status !== "playing") {
      await admin
        .from("rooms")
        .update({ status: "playing", started_at: new Date().toISOString() })
        .eq("id", room.id);
    }
    const { data: updated } = await admin.from("rooms").select("*").eq("id", room.id).single();
    return NextResponse.json({ room: await enrichRoom(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "开始失败" }, { status: 500 });
  }
}