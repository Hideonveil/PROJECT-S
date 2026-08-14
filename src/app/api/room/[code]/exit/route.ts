import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { enrichRoom, recordRoomConnection } from "@/lib/api";
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
    const { data: member } = await admin.from("room_members").select("id,status").eq("room_id", room.id).eq("user_id", me.id).maybeSingle();
    if (!member) return NextResponse.json({ error: "你不在这个房间" }, { status: 403 });

    if (room.status !== "completed" && room.status !== "closed" && member.status === "active") {
      await admin
        .from("room_members")
        .update({ status: "exited", exited_at: new Date().toISOString() })
        .eq("id", member.id);

      await admin
        .from("match_requests")
        .update({ status: "completed" })
        .eq("user_id", me.id)
        .in("status", ["matching", "matched", "playing"]);

      await recordRoomConnection(room);

      const { count } = await admin
        .from("room_members")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("status", "active");

      if (count === 0) {
        await admin
          .from("rooms")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", room.id);
        const { data: memberRows } = await admin.from("room_members").select("user_id").eq("room_id", room.id);
        for (const row of memberRows || []) {
          await admin
            .from("match_requests")
            .update({ status: "completed" })
            .eq("user_id", row.user_id)
            .in("status", ["matching", "matched", "playing"]);
        }
      }
    }

    const { data: updatedRoom } = await admin.from("rooms").select("*").eq("id", room.id).single();
    return NextResponse.json({ room: await enrichRoom(updatedRoom), exited: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "退出失败" }, { status: 500 });
  }
}
