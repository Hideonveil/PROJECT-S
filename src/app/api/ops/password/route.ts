import { NextResponse } from "next/server";
import {
  OPS_COOKIE_NAME,
  isOpsRequestAuthorized,
  opsSessionValue,
  rotateOpsPassword,
  verifyOpsPassword,
} from "@/lib/ops";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function POST(request: Request) {
  if (!(await isOpsRequestAuthorized(request))) {
    return NextResponse.json({ error: { message: "运营登录已失效，请重新进入" } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  const current = await verifyOpsPassword(currentPassword);
  if (!current.valid) {
    return NextResponse.json({ error: { message: "当前密码不正确" } }, { status: 400 });
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return NextResponse.json({ error: { message: "新密码需要 12–128 位" } }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: { message: "两次输入的新密码不一致" } }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: { message: "新密码不能和当前密码相同" } }, { status: 400 });
  }

  const sessionVersion = await rotateOpsPassword(newPassword);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_COOKIE_NAME, opsSessionValue(sessionVersion), cookieOptions);
  return response;
}
