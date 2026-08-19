import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { usernameToEmail } from "@/lib/username";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (username.length < 2 || username.length > 24 || /\s/.test(username)) {
      return NextResponse.json({ error: "用户名需为 2-24 个字符且不能包含空格" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }

    const email = usernameToEmail(username);
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });

    if (error) {
      const message = String(error.message || error.code || "");
      const code = String(error.code || "");
      const combined = `${message} ${code}`.toLowerCase();
      if (combined.includes("already") || combined.includes("registered") || combined.includes("email_exists") || combined.includes("duplicate")) {
        return NextResponse.json({ error: "用户名已存在，请换一个" }, { status: 409 });
      }
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }

    await trackEvent({ eventName: "account_registered", requestId: rid });
    return jsonOk({ ok: true, email }, rid);
  } catch (error) {
    return errorResponse(error, rid, "注册失败，请稍后重试");
  }
}
