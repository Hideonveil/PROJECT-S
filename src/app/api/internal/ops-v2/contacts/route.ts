import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsV2Authorization(request);
    const { data, error } = await supabaseAdmin().from("feedback").select("id,user_id,username,feedback_type,content,contact_email,ops_status,created_at,ops_updated_at").order("created_at", { ascending: false }).limit(250);
    if (error) throw error;
    return jsonOk({ contacts: data || [] }, rid);
  } catch (error) { return errorResponse(error, rid, "读取 Contact Us 失败"); }
}
