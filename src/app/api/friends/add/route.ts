import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { bearerToken } from "@/lib/http";
import { friendsFor } from "@/lib/api";
import { publicProfilesFor } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: me } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const code = String(body.friendCode || "").trim().toUpperCase();
    const { data: target } = await admin.from("profiles").select("*").eq("friend_code", code).maybeSingle();
    if (!target || target.id === me.id) return NextResponse.json({ error: "没有找到这个代码" }, { status: 404 });

    await admin.from("friendships").upsert(
      [
        { user_id: me.id, friend_id: target.id, status: "accepted" },
        { user_id: target.id, friend_id: me.id, status: "accepted" },
      ],
      { onConflict: "user_id,friend_id", ignoreDuplicates: true }
    );

    const [safeTarget] = await publicProfilesFor([target.id]);
    return NextResponse.json({ user: safeTarget, friends: await friendsFor(me.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 500 });
  }
}
