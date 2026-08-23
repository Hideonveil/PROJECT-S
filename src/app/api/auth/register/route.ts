import { NextResponse } from "next/server";
import { anonClient, supabaseAdmin } from "@/lib/supabase";
import { isValidUsername, normalizeUsername } from "@/lib/username";
import { generateFriendCode } from "@/lib/api";
import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const username = normalizeUsername(String(body.username || ""));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!isValidUsername(username)) {
      return NextResponse.json({ error: "用户名需为 2-24 位中文、字母、数字、下划线或短横线" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: existingUsername } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existingUsername) {
      return NextResponse.json({ error: "用户名已存在，请换一个" }, { status: 409 });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { data, error } = await anonClient().auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${origin}/#/auth`,
      },
    });

    if (error) {
      const message = String(error.message || error.code || "");
      const code = String(error.code || "");
      const combined = `${message} ${code}`.toLowerCase();
      if (combined.includes("already") || combined.includes("registered") || combined.includes("email_exists") || combined.includes("duplicate")) {
        return NextResponse.json({ error: "邮箱或用户名已存在，请直接登录" }, { status: 409 });
      }
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }

    if (!data.user?.id) {
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }
    // Supabase may mask an existing email as a user with no identities. Never
    // attach a new username or delete that existing account in this case.
    if (!data.user.identities?.length) {
      return NextResponse.json({ error: "邮箱或用户名已存在，请直接登录" }, { status: 409 });
    }

    const { error: profileError } = await admin.from("profiles").insert({
      auth_user_id: data.user.id,
      username,
      nickname: username,
      avatar_key: "",
      device: "",
      gender: "男",
      age_range: "保密",
      genres: [],
      play_style: "",
      voice: true,
      online: false,
      friend_code: generateFriendCode(),
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      if (profileError.code === "23505") {
        return NextResponse.json({ error: "用户名已存在，请换一个" }, { status: 409 });
      }
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }

    await trackEvent({ eventName: "account_registered", requestId: rid });
    return jsonOk({ ok: true, email, username, requiresEmailVerification: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "注册失败，请稍后重试");
  }
}
