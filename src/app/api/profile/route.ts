import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { profileWithGames } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token || "");
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: existing } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "个人资料不存在" }, { status: 404 });

    const nickname = String(body.nickname || existing.nickname).trim().slice(0, 12);
    const genres = Array.isArray(body.genres)
      ? body.genres.map((g: unknown) => String(g)).filter(Boolean).slice(0, 12)
      : existing.genres || [];
    await admin
      .from("profiles")
      .update({
        nickname: nickname || existing.nickname,
        avatar_key: String(body.avatarKey || existing.avatar_key),
        device: String(body.device || existing.device),
        gender: String(body.gender || existing.gender),
        genres,
        play_style: String(body.playStyle ?? existing.play_style),
        voice: body.voice !== undefined ? body.voice : existing.voice,
        game_accounts:
          body.gameAccounts && typeof body.gameAccounts === "object"
            ? body.gameAccounts
            : existing.game_accounts || {},

        online: true,
        last_seen: new Date().toISOString(),
      })
      .eq("id", existing.id);

    const { data: updated } = await admin.from("profiles").select("*").eq("id", existing.id).single();
    return NextResponse.json({ user: await profileWithGames(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}