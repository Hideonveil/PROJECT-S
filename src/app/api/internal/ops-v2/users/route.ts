import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    const { data, error } = await supabaseAdmin().from("profiles").select("id,username,nickname,online,last_seen,created_at").order("last_seen", { ascending: false, nullsFirst: false }).limit(250);
    if (error) throw error;
    return jsonOk({ users: data || [] }, rid);
  } catch (error) { return errorResponse(error, rid, "读取用户运营列表失败"); }
}
