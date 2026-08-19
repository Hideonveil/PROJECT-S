import { supabaseAdmin } from "./supabase";

export const CLIENT_EVENT_NAMES = new Set([
  "page_view",
  "client_error",
  "candidate_viewed",
  "match_filter_opened",
  "game_account_copied",
  "feedback_opened",
]);

const MAX_PROPERTY_COUNT = 20;
const MAX_STRING_LENGTH = 240;

export function safeEventProperties(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .slice(0, MAX_PROPERTY_COUNT)
      .map(([key, value]) => [key.slice(0, 64), safePropertyValue(value)])
  );
}

function safePropertyValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(safePropertyValue);
  return undefined;
}

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
    properties: safeEventProperties(input.properties),
  });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

export function reportServerError(input: {
  error: unknown;
  requestId: string;
  code: string;
  fallback: string;
}) {
  const errorName = input.error instanceof Error ? input.error.name : "UnknownError";
  console.error(JSON.stringify({
    level: "error",
    event: "server_error",
    requestId: input.requestId,
    code: input.code,
    errorName,
  }));
  void trackEvent({
    eventName: "server_error",
    requestId: input.requestId,
    properties: {
      code: input.code,
      errorName,
      fallback: input.fallback,
    },
  }).catch((loggingError) => {
    console.warn(JSON.stringify({
      level: "warn",
      event: "server_error_persist_failed",
      requestId: input.requestId,
      errorName: loggingError instanceof Error ? loggingError.name : "UnknownError",
    }));
  });
}
