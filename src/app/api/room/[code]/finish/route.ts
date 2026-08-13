import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { enrichRoom } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/lib/types";

function mapSession(s: Session | null) {
  if (!s) return null;
  return {
    id: s.id,
    roomCode: s.room_code,
    players: s.players,
    need: s.need,
    outcomeBy: s.outcome_by,
    rematchBy: s.rematch_by,
    status: s.status,
    createdAt: s.created_at,
  };
}

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

    const { data: existingSession } = await admin.from("sessions").select("*").eq("room_code", code).maybeSingle();

    if (room.status !== "finished") {
      await admin.from("rooms").update({ status: "finished" }).eq("id", room.id);
    }

    let session = (existingSession as Session) || null;
    if (!session) {
      const { data: members } = await admin.from("room_members").select("user_id").eq("room_id", room.id);
      const { data: created } = await admin
        .from("sessions")
        .insert({
          room_code: code,
          players: (members || []).map((m) => m.user_id),
          need: room.need || {},
          outcome_by: {},
          rematch_by: {},
          status: "active",
        })
        .select("*")
        .single();
      session = created as Session;
    }

    const { data: updatedRoom } = await admin.from("rooms").select("*").eq("id", room.id).single();
    return NextResponse.json({ room: await enrichRoom(updatedRoom), session: mapSession(session) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "结束失败" }, { status: 500 });
  }
}