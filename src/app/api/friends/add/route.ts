import { friendsFor } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { publicProfilesFor } from "@/lib/data";
import { friendRequestsFor } from "@/lib/friendships";
import { AppError, errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const targetUserId = String(body.targetUserId || "").trim();
    const code = String(body.friendCode || "").trim().toUpperCase();
    let targetQuery = admin.from("profiles").select("id,friend_code");
    targetQuery = targetUserId ? targetQuery.eq("id", targetUserId) : targetQuery.eq("friend_code", code);
    const { data: target } = await targetQuery.maybeSingle();
    if (!target || target.id === me.id) throw new AppError("FRIEND_PROFILE_NOT_FOUND", "没有找到这个代码", 404);

    const { data: result, error: rpcError } = await admin.rpc("phase1_request_friendship", {
      p_actor_id: me.id,
      p_target_id: target.id,
    });
    if (rpcError) throw rpcError;
    const [safeTarget] = await publicProfilesFor([target.id]);
    return jsonOk({
      user: safeTarget,
      status: String(result?.status || "pending"),
      friends: await friendsFor(me.id),
      friendRequests: await friendRequestsFor(me.id),
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "好友申请发送失败，请稍后重试");
  }
}
