import { Resend } from "resend";
import { env, supabaseAdmin } from "./supabase";
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
  if (content.length < 10 || content.length > 2000) {
    throw new Error("反馈内容需要在 10 到 2000 个字符之间");
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

export async function sendFeedbackEmail(row: FeedbackRow): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  const to = env("FEEDBACK_TO_EMAIL");
  const from = env("RESEND_FROM_EMAIL");
  const resend = new Resend(apiKey);

  const isBug = row.feedback_type === "bug" || row.feedback_type === "Bug";
  const subject = isBug
    ? `[MVP Feedback][BUG] ${row.username || "匿名用户"}`
    : `[MVP Feedback] ${row.username || "匿名用户"} - ${row.feedback_type}`;

  const text = [
    `用户：${row.username || "匿名用户"}`,
    `User ID：${row.user_id || "-"}`,
    `反馈类型：${row.feedback_type}`,
    `反馈内容：${row.content}`,
    `当前页面：${row.current_page || "-"}`,
    `当前游戏：${row.current_game || "-"}`,
    `当前匹配：${row.current_match_request_id || "-"}`,
    `用户填写的联系邮箱：${row.contact_email || "-"}`,
    `提交时间：${row.created_at}`,
  ].join("\n");

  const html = [
    "<div style='font-family:Arial,sans-serif;line-height:1.6;color:#1f2937'>",
    "<h2 style='margin:0 0 12px'>MVP Feedback</h2>",
    `<p><strong>用户：</strong>${escapeHtml(row.username || "匿名用户")}</p>`,
    `<p><strong>User ID：</strong>${escapeHtml(row.user_id || "-")}</p>`,
    `<p><strong>反馈类型：</strong>${escapeHtml(row.feedback_type)}</p>`,
    `<p><strong>反馈内容：</strong><br/>${escapeHtml(row.content).replace(/\n/g, "<br/>")}</p>`,
    `<p><strong>当前页面：</strong>${escapeHtml(row.current_page || "-")}</p>`,
    `<p><strong>当前游戏：</strong>${escapeHtml(row.current_game || "-")}</p>`,
    `<p><strong>当前匹配：</strong>${escapeHtml(row.current_match_request_id || "-")}</p>`,
    `<p><strong>用户填写的联系邮箱：</strong>${escapeHtml(row.contact_email || "-")}</p>`,
    `<p><strong>提交时间：</strong>${escapeHtml(row.created_at)}</p>`,
    "</div>",
  ].join("");

  await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  });
}

export async function updateEmailStatus(
  feedbackId: string,
  status: "sent" | "failed",
  error: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { email_status: status };
  if (status === "sent") patch.email_sent_at = new Date().toISOString();
  if (status === "failed") patch.email_error = String(error || "").slice(0, 1000);
  await supabaseAdmin().from("feedback").update(patch).eq("id", feedbackId);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}