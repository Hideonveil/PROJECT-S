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
    await admin
      .from("profiles")
      .update({
        nickname: nickname || existing.nickname,
        avatar_key: String(body.avatarKey || existing.avatar_key),
        device: String(body.device || existing.device),
        play_style: String(body.playStyle ?? existing.play_style),
        voice: body.voice !== undefined ? body.voice : existing.voice,
        online: true,
        last_seen: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (Array.isArray(body.games)) {
      await admin.from("user_games").delete().eq("user_id", existing.id);
      const gameRows = (body.games as Array<Record<string, unknown>>).map((g) => ({
        user_id: existing.id,
        game_id: String(g.gameId || ""),
        role: String(g.role || ""),
        level: Number(g.level || 60),
        win_rate: String(g.winRate || "50%"),
        note: String(g.note || ""),
      }));
      if (gameRows.length) await admin.from("user_games").insert(gameRows);
    }

    const { data: updated } = await admin.from("profiles").select("*").eq("id", existing.id).single();
    return NextResponse.json({ user: await profileWithGames(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}