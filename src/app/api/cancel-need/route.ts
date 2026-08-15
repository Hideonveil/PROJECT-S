import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { bearerToken } from "@/lib/http";
import { poolCounts } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (profile) {
      await admin.from("match_requests").update({ status: "cancelled" }).eq("user_id", profile.id).in("status", ["matching", "matched"]);
    }
    const counts = await poolCounts();
    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "取消失败" }, { status: 500 });
  }
}
