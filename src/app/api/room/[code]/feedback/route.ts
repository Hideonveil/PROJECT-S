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
    if (session.status !== "completed") throw new Error("SESSION_NOT_COMPLETED");

    const rating = ["happy", "meh", "bad"].includes(String(body.rating || "")) ? String(body.rating) : null;
    const wantAgain = typeof body.wantAgain === "boolean" ? body.wantAgain : null;
    const liked = typeof body.liked === "boolean" ? body.liked : null;
    const { data: existingResponse } = await admin
      .from("session_responses")
      .select("liked")
      .eq("session_id", session.id)
      .eq("user_id", me.id)
      .maybeSingle();
    const effectiveLiked = liked ?? existingResponse?.liked ?? false;
    const patch: Record<string, unknown> = {
      session_id: session.id,
      user_id: me.id,
      updated_at: new Date().toISOString(),
    };
    if (rating) patch.rating = rating;
    if (wantAgain !== null) patch.want_again = wantAgain;
    if (liked !== null) patch.liked = liked;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("session_responses").upsert(patch, {
        onConflict: "session_id,user_id",
      });
      if (error) throw error;
    }

    const { data: matchPair } = await admin
      .from("matchmaking_pairs")
      .select("id")
      .eq("session_id", session.id)
      .maybeSingle();
    if (matchPair?.id) {
      const { error: matchFeedbackError } = await admin.rpc("matchmaking_submit_feedback", {
        p_pair_id: matchPair.id,
        p_user_id: me.id,
        p_did_play: true,
        p_rating: rating,
        p_want_again: wantAgain,
        p_tags: effectiveLiked ? ["liked"] : [],
        p_note: "",
      });
      if (matchFeedbackError) throw matchFeedbackError;
    }

    return jsonOk({ ok: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "保存失败，请稍后重试");
  }
}
