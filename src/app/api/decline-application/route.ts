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
    const { data: me } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data: application } = await admin
      .from("applications")
      .select("*")
      .eq("id", String(body.applicationId || ""))
      .maybeSingle();
    if (!application || application.to_user_id !== me.id) {
      return NextResponse.json({ error: "申请无效" }, { status: 400 });
    }
    await admin.from("applications").update({ status: "declined" }).eq("id", application.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 500 });
  }
}