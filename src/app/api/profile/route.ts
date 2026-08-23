import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { bearerToken, errorResponse, jsonBody, requestId } from "@/lib/http";
import { profileWithGames } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";

const MAX_AVATAR_KEY_LENGTH = 512_000;
const MAX_GAME_ACCOUNTS_JSON_LENGTH = 16_000;

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
    if (!existing) return NextResponse.json({ error: "个人资料不存在" }, { status: 404 });

    const nickname = String(body.nickname || existing.nickname).trim().slice(0, 12);
    const genres = Array.isArray(body.genres)
      ? body.genres.map((g: unknown) => String(g).trim().slice(0, 40)).filter(Boolean).slice(0, 12)
      : existing.genres || [];
    const avatarKey = Object.prototype.hasOwnProperty.call(body, "avatarKey")
      ? String(body.avatarKey || "")
      : String(existing.avatar_key || "");
    if (avatarKey.length > MAX_AVATAR_KEY_LENGTH) {
      return NextResponse.json({ error: "头像数据过大" }, { status: 413 });
    }
    const suppliedAccounts = body.gameAccounts && typeof body.gameAccounts === "object" && !Array.isArray(body.gameAccounts)
      ? body.gameAccounts
      : null;
    if (suppliedAccounts && JSON.stringify(suppliedAccounts).length > MAX_GAME_ACCOUNTS_JSON_LENGTH) {
      return NextResponse.json({ error: "游戏账号信息过大" }, { status: 413 });
    }
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        nickname: nickname || existing.nickname,
        avatar_key: avatarKey,
        device: String(body.device || existing.device).trim().slice(0, 32),
        gender: String(body.gender || existing.gender).trim().slice(0, 32),
        age_range: String(body.ageRange || existing.age_range || "保密").trim().slice(0, 32),
        genres,
        play_style: String(body.playStyle ?? existing.play_style).trim().slice(0, 120),
        voice: typeof body.voice === "boolean" ? body.voice : existing.voice,
        game_accounts: suppliedAccounts || existing.game_accounts || {},

        online: true,
        last_seen: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;

    const { data: updated, error: readError } = await admin.from("profiles").select("*").eq("id", existing.id).single();
    if (readError || !updated) throw readError || new Error("PROFILE_UPDATE_NOT_FOUND");
    return NextResponse.json({ user: await profileWithGames(updated) });
  } catch (error) {
    return errorResponse(error, rid, "保存失败，请稍后重试");
  }
}
