import { supabaseAdmin } from "./supabase";
import type { FeedbackRow, Profile } from "./types";

export interface FeedbackPayload {
  feedbackType: string;
  content: string;
  contactEmail: string | null;
  currentPage: string | null;
  currentGame: string | null;
  currentMatchRequestId: string | null;
  requestId: string | null;
  userAgent: string | null;
}

const ALLOWED_TYPES = new Set([
  "bug",
  "suggestion",
  "other",
  "产品建议",
  "功能需求",
  "Bug",
  "匹配问题",
  "聊天问题",
  "登录问题",
  "其他",
]);

export async function saveFeedback(
  profile: Profile | null,
  payload: FeedbackPayload,
  userEmail?: string | null
): Promise<{ row: FeedbackRow; duplicate: boolean }> {
  const content = String(payload.content || "").trim();
  const feedbackType = String(payload.feedbackType || "other").trim();
  if (content.length < 10 || content.length > 500) {
    throw new Error("反馈内容需要在 10 到 500 个字符之间");
  }
  if (!ALLOWED_TYPES.has(feedbackType)) {
    throw new Error("反馈类型无效");
  }

  const row = {
    user_id: profile?.id || null,
    username: profile?.nickname || null,
    user_email: userEmail || null,
    feedback_type: feedbackType,
    content,
    contact_email: payload.contactEmail || null,
    current_page: payload.currentPage || null,
    current_game: payload.currentGame || null,
    current_match_request_id: payload.currentMatchRequestId || null,
    user_agent: payload.userAgent || null,
    request_id: payload.requestId || null,
  };

  const { data, error } = await supabaseAdmin()
    .from("feedback")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    const isDuplicate = String(error.message || "").toLowerCase().includes("duplicate");
    if (isDuplicate && payload.requestId) {
      const { data: existing } = await supabaseAdmin()
        .from("feedback")
        .select("*")
        .eq("request_id", payload.requestId)
        .maybeSingle();
      if (existing) return { row: existing as FeedbackRow, duplicate: true };
    }
    throw error;
  }

  return { row: data as FeedbackRow, duplicate: false };
}
