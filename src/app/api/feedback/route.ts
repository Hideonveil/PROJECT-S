import { NextResponse } from "next/server";
import { authUserFromToken, profileByAuthId } from "@/lib/auth";
import { bearerToken } from "@/lib/http";
import { saveFeedback } from "@/lib/feedback";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    const profile = authUser ? await profileByAuthId(authUser.id) : null;

    const payload = {
      feedbackType: String(body.category || body.feedbackType || "other"),
      content: String(body.message || body.content || ""),
      contactEmail: String(body.contact || body.contactEmail || "").trim() || null,
      currentPage: String(body.currentPage || "").trim() || null,
      currentGame: String(body.currentGame || "").trim() || null,
      currentMatchRequestId: String(body.currentMatchRequestId || "").trim() || null,
      requestId: String(body.requestId || "").trim() || null,
      userAgent: request.headers.get("user-agent"),
    };

    let saved;
    try {
      saved = await saveFeedback(profile, payload, authUser?.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败，请稍后重试";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (saved.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交失败，请稍后重试" }, { status: 500 });
  }
}
