import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);
    const { data, error } = await supabaseAdmin().rpc("presence_heartbeat", {
      p_user_id: profile.id,
    });
    if (error) throw error;
    return jsonOk({ online: true, heartbeat: true, ...((data && typeof data === "object") ? data : {}) }, rid);
  } catch (error) {
    return errorResponse(error, rid, "在线状态更新失败");
  }
}
