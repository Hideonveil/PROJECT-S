import { AppError, errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { appendOpsAudit } from "@/lib/ops-v2/audit";
import { requireOpsV2Authorization } from "@/lib/ops-v2/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["unread", "read", "resolved"]);

export async function PATCH(request: Request, context: { params: Promise<{ contactId: string }> }) {
  const rid = requestId(request);
  try {
    const actor = await requireOpsV2Authorization(request);
    const body = await jsonBody(request);
    const status = String(body.status || "");
    const { contactId } = await context.params;
    if (!ALLOWED_STATUSES.has(status)) throw new AppError("OPS_CONTACT_STATUS_INVALID", "Contact 状态无效", 422, false);
    const admin = supabaseAdmin();
    const { data: before, error: beforeError } = await admin.from("feedback").select("id,user_id,ops_status").eq("id", contactId).maybeSingle();
    if (beforeError || !before) throw beforeError || new AppError("OPS_CONTACT_NOT_FOUND", "未找到这条 Contact", 404, false);
    const { data: updated, error } = await admin.from("feedback").update({ ops_status: status, ops_updated_at: new Date().toISOString() }).eq("id", contactId).select("id,ops_status,ops_updated_at").single();
    if (error) throw error;
    await appendOpsAudit({ operator: actor.operator, action: "CONTACT_STATUS_UPDATED", targetUserId: before.user_id || undefined, beforeState: { contactId, opsStatus: before.ops_status }, result: updated, reason: `status:${status}` });
    return jsonOk({ contact: updated }, rid);
  } catch (error) { return errorResponse(error, rid, "更新 Contact 状态失败"); }
}
