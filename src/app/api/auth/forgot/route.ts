import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase";
import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 320) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }

    const limit = takeRateLimit(`auth-forgot:${clientAddress(request)}:${email}`, 3, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "发送过于频繁，请稍后再试", meta: { requestId: rid } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { error } = await anonClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/index.html#/auth`,
    });
    if (error) return NextResponse.json({ error: "邮件发送失败，请稍后重试" }, { status: 502 });

    // Keep the response generic so the endpoint does not reveal whether an
    // email address belongs to an existing account.
    return jsonOk({ ok: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "邮件发送失败，请稍后重试");
  }
}
