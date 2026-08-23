import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonBody, requestId } from "@/lib/http";
import { saveFeedback } from "@/lib/feedback";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);

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
      saved = await saveFeedback(profile, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败，请稍后重试";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (saved.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, rid, "提交失败，请稍后重试");
  }
}
