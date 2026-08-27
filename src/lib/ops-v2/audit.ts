import { supabaseAdmin } from "../supabase";
import type { OpsAuditInput } from "./types";

type AuditClient = {
  from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };
};

export async function appendOpsAudit(input: OpsAuditInput, client: AuditClient = supabaseAdmin() as unknown as AuditClient): Promise<void> {
  const { error } = await client.from("ops_audit_log").insert({
    operator: input.operator.slice(0, 100),
    action: input.action.slice(0, 120),
    target_user_id: input.targetUserId || null,
    target_room_id: input.targetRoomId || null,
    before_state: input.beforeState || {},
    result: input.result,
    reason: input.reason?.slice(0, 500) || null,
  });
  if (error) throw new Error(`OPS_AUDIT_WRITE_FAILED:${error.message || "unknown"}`);
}
