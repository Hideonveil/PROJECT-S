import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);
    const { error } = await supabaseAdmin()
      .from("profiles")
      .update({ online: true, last_seen: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) throw error;
    return jsonOk({ online: true }, rid);
  } catch (error) {
    return errorResponse(error, rid, "在线状态更新失败");
  }
}
