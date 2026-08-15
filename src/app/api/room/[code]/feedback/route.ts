import { requireRequestProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { sessionForRoomCode } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  try {
    const { code } = await params;
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const session = await sessionForRoomCode(code);
    if (!(session.players || []).includes(me.id)) throw new Error("SESSION_FORBIDDEN");
    if (!["completed", "active"].includes(session.status)) throw new Error("SESSION_NOT_COMPLETED");

    const rating = ["happy", "meh", "bad"].includes(String(body.rating || "")) ? String(body.rating) : null;
    const wantAgain = typeof body.wantAgain === "boolean" ? body.wantAgain : null;
    const patch: Record<string, unknown> = {
      session_id: session.id,
      user_id: me.id,
      updated_at: new Date().toISOString(),
    };
    if (rating) patch.rating = rating;
    if (wantAgain !== null) patch.want_again = wantAgain;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("session_responses").upsert(patch, {
        onConflict: "session_id,user_id",
      });
      if (error) throw error;
    }

    return jsonOk({ ok: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "保存失败，请稍后重试");
  }
}
