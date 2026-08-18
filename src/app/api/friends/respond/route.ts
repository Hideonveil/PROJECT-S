import { friendsFor } from "@/lib/api";
import { requireRequestProfile } from "@/lib/auth";
import { friendRequestsFor } from "@/lib/friendships";
import { AppError, errorResponse, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const requesterId = String(body.requesterId || "").trim();
    const decision = String(body.decision || "").trim();
    if (!requesterId || !["accepted", "rejected"].includes(decision)) {
      throw new AppError("FRIEND_DECISION_INVALID", "请选择接受或拒绝", 422);
    }
    const { data: result, error: rpcError } = await supabaseAdmin().rpc("phase1_respond_friendship", {
      p_receiver_id: me.id,
      p_requester_id: requesterId,
      p_decision: decision,
    });
    if (rpcError) throw rpcError;
    return jsonOk({
      status: String(result?.status || decision),
      friends: await friendsFor(me.id),
      friendRequests: await friendRequestsFor(me.id),
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "好友申请处理失败，请稍后重试");
  }
}
