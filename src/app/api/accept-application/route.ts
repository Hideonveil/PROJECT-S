import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { activeRequest, enrichRoom, generateRoomCode } from "@/lib/api";
import { needFromRequest } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token || "");
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: me } = await admin.from("profiles").select("*").eq("auth_user_id", authUser.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "请先创建游戏身份" }, { status: 400 });

    const { data: application } = await admin
      .from("applications")
      .select("*")
      .eq("id", String(body.applicationId || ""))
      .maybeSingle();
    if (!application || application.to_user_id !== me.id) {
      return NextResponse.json({ error: "申请无效" }, { status: 400 });
    }
    if (application.status !== "pending") {
      return NextResponse.json({ error: "申请已处理" }, { status: 400 });
    }

    await admin.from("applications").update({ status: "accepted" }).eq("id", application.id);

    const fromRequest = await activeRequest(application.from_user_id);
    const need = fromRequest ? needFromRequest(fromRequest) : {};

    let roomId = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = generateRoomCode();
      const { data: created, error } = await admin
        .from("rooms")
        .insert({ code, application_id: application.id, need, status: "ready" })
        .select("*")
        .single();
      if (created) {
        roomId = created.id;
        break;
      }
      if (attempt === 5 || !String(error?.message || "").toLowerCase().includes("code")) {
        return NextResponse.json({ error: error?.message || "开房失败" }, { status: 500 });
      }
    }

    await admin
      .from("room_members")
      .insert([
        { room_id: roomId, user_id: application.from_user_id },
        { room_id: roomId, user_id: application.to_user_id },
      ]);

    for (const uid of [application.from_user_id, application.to_user_id]) {
      await admin
        .from("match_requests")
        .update({ status: "playing" })
        .eq("user_id", uid)
        .in("status", ["matching", "matched"]);
    }

    const { data: room } = await admin.from("rooms").select("*").eq("id", roomId).single();
    return NextResponse.json({ room: await enrichRoom(room) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "接受失败" }, { status: 500 });
  }
}