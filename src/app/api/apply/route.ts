import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
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

    const toUserId = String(body.toUserId || "");
    if (!toUserId || toUserId === me.id) return NextResponse.json({ error: "申请对象无效" }, { status: 400 });
    const { data: target } = await admin.from("profiles").select("id").eq("id", toUserId).maybeSingle();
    if (!target) return NextResponse.json({ error: "玩家不存在" }, { status: 404 });

    const { data: application, error } = await admin
      .from("applications")
      .insert({ from_user_id: me.id, to_user_id: toUserId, status: "pending" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ application });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "申请失败" }, { status: 500 });
  }
}