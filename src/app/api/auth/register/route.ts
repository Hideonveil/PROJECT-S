import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { usernameToEmail } from "@/lib/username";

export async function POST(request: Request) {
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
      if (message.toLowerCase().includes("already registered") || message.includes("email_exists")) {
        return NextResponse.json({ error: "用户名已存在，请换一个" }, { status: 409 });
      }
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "注册失败" }, { status: 500 });
  }
}
