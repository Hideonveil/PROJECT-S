import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase";
import { usernameToEmail } from "@/lib/username";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const email = usernameToEmail(username);
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
