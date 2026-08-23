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

export type ServerErrorContext = {
  userId?: string | null;
  roomId?: string | null;
  sessionId?: string | null;
  ticketId?: string | null;
  requestId?: string | null;
  action?: string | null;
  route?: string | null;
  timestamp?: string | null;
};

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

export function buildServerErrorRecord(input: {
  error: unknown;
  requestId: string;
  code: string;
  context?: ServerErrorContext;
}) {
  const errorName = input.error instanceof Error ? input.error.name : "UnknownError";
  const context = input.context || {};
  return {
    level: "error",
    event: "server_error",
    user_id: context.userId || null,
    room_id: context.roomId || null,
    session_id: context.sessionId || null,
    ticket_id: context.ticketId || null,
    request_id: context.requestId || input.requestId,
    action: context.action || null,
    route: context.route || null,
    timestamp: context.timestamp || new Date().toISOString(),
    code: input.code,
    error_name: errorName,
  };
}

export function reportServerError(input: {
  error: unknown;
  requestId: string;
  code: string;
  fallback: string;
  context?: ServerErrorContext;
}) {
  const record = buildServerErrorRecord(input);
  console.error(JSON.stringify(record));
  void trackEvent({
    eventName: "server_error",
    userId: input.context?.userId,
    sessionId: input.context?.sessionId,
    roomId: input.context?.roomId,
    requestId: input.requestId,
    properties: {
      code: input.code,
      errorName: record.error_name,
      fallback: input.fallback,
      ticket_id: record.ticket_id,
      action: record.action,
      route: record.route,
      timestamp: record.timestamp,
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
