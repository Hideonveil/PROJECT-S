import { AppError } from "./http";
import { supabaseAdmin } from "./supabase";
import type { Session } from "./types";

export function mapSession(s: Session | null) {
  if (!s) return null;
  return {
    id: s.id,
    roomId: s.room_id,
    roomCode: s.room_code,
    players: s.players,
    need: s.need,
    outcomeBy: s.outcome_by,
    rematchBy: s.rematch_by,
    status: s.status === "active" ? "completed" : s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    completionReason: s.completion_reason,
    resolution: s.resolution || "waiting",
    sourceSessionId: s.source_session_id,
    version: s.version || 1,
    createdAt: s.created_at,
  };
}

export async function sessionForRoomCode(code: string): Promise<Session> {
  const admin = supabaseAdmin();
  const { data: room } = await admin.from("rooms").select("id").eq("code", code).maybeSingle();
  if (!room) throw new AppError("ROOM_NOT_FOUND", "房间不存在", 404);
  const { data: session } = await admin
    .from("sessions")
    .select("*")
    .eq("room_id", room.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) throw new AppError("SESSION_NOT_FOUND", "Session 不存在", 404);
  return session as Session;
}
