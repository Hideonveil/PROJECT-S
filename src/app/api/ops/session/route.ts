import { NextResponse } from "next/server";
import { OPS_COOKIE_NAME, opsSessionValue, verifyOpsPassword } from "@/lib/ops";
import { clientAddress, takeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = takeRateLimit(`ops-login:${clientAddress(request)}`, 5, 10 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试" } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");
  const verification = await verifyOpsPassword(password);
  if (!verification.valid) {
    return NextResponse.json({ error: { message: "运营密码不正确" } }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_COOKIE_NAME, opsSessionValue(verification.sessionVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
