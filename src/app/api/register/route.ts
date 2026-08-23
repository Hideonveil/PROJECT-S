import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { generateFriendCode, profileWithGames } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { bearerToken, errorResponse, idempotencyKey, jsonBody, requestId } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

const MAX_AVATAR_KEY_LENGTH = 512_000;

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: existing } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (existing && Array.isArray(existing.genres) && existing.genres.length > 0) {
      await admin.from("profiles").update({ online: true, last_seen: new Date().toISOString() }).eq("id", existing.id);
      return NextResponse.json({ user: await profileWithGames(existing) });
    }
    if (existing) {
      const nickname = String(body.nickname || existing.nickname || authUser.user_metadata?.username || "").trim().slice(0, 12);
      const genres = Array.isArray(body.genres)
        ? body.genres.map((g: unknown) => String(g)).filter(Boolean).slice(0, 12)
        : [];
      if (!nickname || !genres.length) {
        return NextResponse.json({ error: "昵称和常玩游戏类型不能为空" }, { status: 400 });
      }
      const { data: updated, error: updateError } = await admin.from("profiles").update({
        nickname,
        avatar_key: typeof body.avatarKey === "string" ? body.avatarKey : existing.avatar_key || "",
        device: String(body.device || existing.device || "PC"),
        gender: String(body.gender || existing.gender || "男"),
        age_range: String(body.ageRange || existing.age_range || "保密"),
        genres,
        play_style: String(body.playStyle || existing.play_style || ""),
        voice: body.voice !== false,
        online: true,
        last_seen: new Date().toISOString(),
      }).eq("id", existing.id).select("*").single();
      if (updateError || !updated) return NextResponse.json({ error: updateError?.message || "注册失败，请稍后重试" }, { status: 500 });
      return NextResponse.json({ user: await profileWithGames(updated) });
    }

    const nickname = String(body.nickname || authUser.user_metadata?.username || "").trim().slice(0, 12);
    const genres = Array.isArray(body.genres)
      ? body.genres.map((g: unknown) => String(g)).filter(Boolean).slice(0, 12)
      : [];
    if (!nickname || !genres.length) {
      return NextResponse.json({ error: "昵称和常玩游戏类型不能为空" }, { status: 400 });
    }
    const avatarKey = typeof body.avatarKey === "string" ? body.avatarKey : "";
    if (avatarKey.length > MAX_AVATAR_KEY_LENGTH) {
      return NextResponse.json({ error: "头像数据过大" }, { status: 413 });
    }

    let profileId = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: created, error } = await admin
        .from("profiles")
        .insert({
          auth_user_id: authUser.id,
          nickname,
          avatar_key: avatarKey,
          device: String(body.device || "PC"),
          gender: String(body.gender || "男"),
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
    return errorResponse(error, rid, "注册失败，请稍后重试");
  }
}
