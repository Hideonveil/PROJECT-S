import { requireRequestProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { AppError, errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { sessionForRoomCode } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  let userId: string | null = null;
  let roomId: string | null = null;
  let sessionId: string | null = null;
  try {
    code = (await params).code;
    const body = await jsonBody(request);
    const me = await requireRequestProfile(request, body);
    userId = me.id;
    const admin = supabaseAdmin();
    const session = await sessionForRoomCode(code);
    roomId = session.room_id;
    sessionId = session.id;
    if (!(session.players || []).includes(me.id)) throw new Error("SESSION_FORBIDDEN");
    if (session.status !== "completed") throw new Error("SESSION_NOT_COMPLETED");

    const rating = ["happy", "meh", "bad"].includes(String(body.rating || "")) ? String(body.rating) : null;
    const wantAgain = typeof body.wantAgain === "boolean" ? body.wantAgain : null;
    const liked = typeof body.liked === "boolean" ? body.liked : null;

    if (liked !== null) {
      const targetUserId = String(body.targetUserId || "").trim();
      if (!targetUserId) throw new AppError("LIKE_TARGET_REQUIRED", "请选择要点赞的队友", 422);
      if (targetUserId === me.id) throw new AppError("LIKE_SELF_FORBIDDEN", "不能给自己点赞", 422);
      if (!(session.players || []).includes(targetUserId)) {
        throw new AppError("LIKE_TARGET_FORBIDDEN", "只能给同一 Session 中的队友点赞", 403);
      }

      if (liked) {
        const { error } = await admin.from("session_member_likes").upsert({
          session_id: session.id,
          from_user_id: me.id,
          to_user_id: targetUserId,
        }, {
          onConflict: "session_id,from_user_id,to_user_id",
          ignoreDuplicates: true,
        });
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("session_member_likes")
          .delete()
          .eq("session_id", session.id)
          .eq("from_user_id", me.id)
          .eq("to_user_id", targetUserId);
        if (error) throw error;
      }
    }

    if (rating !== null || wantAgain !== null) {
      const patch: Record<string, unknown> = {
        session_id: session.id,
        user_id: me.id,
        updated_at: new Date().toISOString(),
      };
      if (rating !== null) patch.rating = rating;
      if (wantAgain !== null) patch.want_again = wantAgain;
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
    if (matchPair?.id && (rating !== null || wantAgain !== null)) {
      const { error: matchFeedbackError } = await admin.rpc("matchmaking_submit_feedback", {
        p_pair_id: matchPair.id,
        p_user_id: me.id,
        p_did_play: true,
        p_rating: rating,
        p_want_again: wantAgain,
        p_tags: [],
        p_note: "",
      });
      if (matchFeedbackError) throw matchFeedbackError;
    }

    return jsonOk({ ok: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "保存失败，请稍后重试", {
      userId,
      roomId,
      sessionId,
      action: "feedback",
      route: `/api/room/${code || ":code"}/feedback`,
    });
  }
}
