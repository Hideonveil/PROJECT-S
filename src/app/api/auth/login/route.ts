import { NextResponse } from "next/server";
import { anonClient, supabaseAdmin } from "@/lib/supabase";
import { normalizeUsername } from "@/lib/username";
import { AppError, errorResponse, jsonBody, requestId } from "@/lib/http";
import { clientAddress, configuredRateLimit, takeRateLimit } from "@/lib/rate-limit";

const AUTH_LOGIN_IP_LIMIT = configuredRateLimit("AUTH_LOGIN_IP_LIMIT", 300, 30, 1000);
const AUTH_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const ipLimit = takeRateLimit(`auth-login-ip:${clientAddress(request)}`, AUTH_LOGIN_IP_LIMIT, AUTH_LOGIN_WINDOW_MS);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "尝试次数过多，请稍后再试", meta: { requestId: rid } },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }
    const body = await jsonBody(request);
    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json({ error: "请输入用户名/邮箱和密码" }, { status: 400 });
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    let email = isEmail ? normalizedIdentifier : "";
    let username = "";
    if (!isEmail) {
      username = normalizeUsername(identifier);
      const { data: profile } = await supabaseAdmin()
        .from("profiles")
        .select("username,auth_user_id")
        .eq("username", username)
        .maybeSingle();
      if (profile?.auth_user_id) {
        const { data: authData } = await supabaseAdmin().auth.admin.getUserById(profile.auth_user_id);
        email = authData.user?.email || "";
      }
    }

    const accountLimit = takeRateLimit(`auth-login-account:${clientAddress(request)}:${normalizedIdentifier}`, 10, AUTH_LOGIN_WINDOW_MS);
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { error: "尝试次数过多，请稍后再试", meta: { requestId: rid } },
        { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSeconds) } }
      );
    }
    const { data, error } = email
      ? await anonClient().auth.signInWithPassword({ email, password })
      : { data: { session: null, user: null }, error: new Error("invalid_credentials") };
    const authError = String((error as { code?: unknown } | null)?.code || error?.message || "").toLowerCase();
    if (authError.includes("email_not_confirmed") || authError.includes("email not confirmed")) {
      return NextResponse.json({ error: "请先验证邮箱", code: "EMAIL_NOT_VERIFIED", email }, { status: 403 });
    }
    if (error || !data.session) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    if (!data.user?.email_confirmed_at) {
      return NextResponse.json({ error: "请先验证邮箱", code: "EMAIL_NOT_VERIFIED", email }, { status: 403 });
    }

    return NextResponse.json({ ok: true, email, username: username || data.user.user_metadata?.username || "", meta: { requestId: rid } });
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error, rid, "登录失败，请稍后重试");
    }
    return NextResponse.json({ error: "登录失败，请稍后重试", meta: { requestId: rid } }, { status: 500 });
  }
}
