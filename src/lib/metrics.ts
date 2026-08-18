import { supabaseAdmin } from "./supabase";

export const CLIENT_EVENT_NAMES = new Set([
  "candidate_viewed",
  "match_filter_opened",
  "game_account_copied",
  "feedback_opened",
]);

export async function trackEvent(input: {
  eventName: string;
  userId?: string | null;
  sessionId?: string | null;
  roomId?: string | null;
  requestId?: string | null;
  properties?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin().from("product_events").insert({
    event_name: input.eventName,
    user_id: input.userId || null,
    session_id: input.sessionId || null,
    room_id: input.roomId || null,
    request_id: input.requestId || null,
    properties: input.properties || {},
  });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}
