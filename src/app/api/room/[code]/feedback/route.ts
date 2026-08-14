import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { recordRoomConnection } from "@/lib/api";
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

    const { count } = await admin
      .from("recent_connections")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .limit(1);
    if (count === 0) await recordRoomConnection(room);

    const rating = ["happy", "meh", "bad"].includes(String(body.rating || "")) ? String(body.rating) : null;
    const wantAgain = typeof body.wantAgain === "boolean" ? body.wantAgain : null;
    const patch: Record<string, unknown> = {};
    if (rating) patch.rating = rating;
    if (wantAgain !== null) patch.want_again = wantAgain;
    if (Object.keys(patch).length) {
      await admin
        .from("recent_connections")
        .update(patch)
        .eq("user_id", me.id)
        .eq("room_id", room.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
