import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { generateFriendCode, profileWithGames } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { bearerToken, idempotencyKey } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: existing } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (existing) {
      await admin.from("profiles").update({ online: true, last_seen: new Date().toISOString() }).eq("id", existing.id);
      return NextResponse.json({ user: await profileWithGames(existing) });
    }

    const nickname = String(body.nickname || authUser.user_metadata?.username || "").trim().slice(0, 12);
    const genres = Array.isArray(body.genres)
      ? body.genres.map((g: unknown) => String(g)).filter(Boolean).slice(0, 12)
      : [];
    if (!nickname || !genres.length) {
      return NextResponse.json({ error: "昵称和常玩游戏类型不能为空" }, { status: 400 });
    }

    let profileId = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: created, error } = await admin
        .from("profiles")
        .insert({
          auth_user_id: authUser.id,
          nickname,
          avatar_key: String(body.avatarKey || "me-1"),
          device: String(body.device || "PC"),
          gender: String(body.gender || "保密"),
          age_range: String(body.ageRange || "保密"),
          genres,
          play_style: String(body.playStyle || ""),
          voice: body.voice !== false,
          online: true,
          last_seen: new Date().toISOString(),
          friend_code: generateFriendCode(),
        })
        .select("*")
        .single();
      if (created) {
        profileId = created.id;
        break;
      }
      if (attempt === 5 || !String(error?.message || "").toLowerCase().includes("friend_code")) {
        return NextResponse.json({ error: error?.message || "注册失败，请稍后重试" }, { status: 500 });
      }
    }

    const { data: profile } = await admin.from("profiles").select("*").eq("id", profileId).single();
    await trackEvent({
      eventName: "profile_created",
      userId: profileId,
      requestId: idempotencyKey(request),
    });
    return NextResponse.json({ user: await profileWithGames(profile) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "注册失败" }, { status: 500 });
  }
}
