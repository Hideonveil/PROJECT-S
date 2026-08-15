import { enrichRoom } from "./api";
import { supabaseAdmin } from "./supabase";
import type { Application, Room } from "./types";

export async function createPlayingRoom(
  application: Application,
  actorProfileId: string,
  requestId?: string | null
): Promise<Room> {
  const admin = supabaseAdmin();
  const { data: result, error } = await admin.rpc("phase1_accept_application", {
    p_application_id: application.id,
    p_actor_id: actorProfileId,
    p_request_id: requestId || null,
  });
  if (error) throw error;
  const roomId = String(result?.roomId || "");
  if (!roomId) throw new Error("ROOM_CREATE_FAILED");
  const { data: room, error: roomError } = await admin.from("rooms").select("*").eq("id", roomId).single();
  if (roomError || !room) throw roomError || new Error("ROOM_CREATE_FAILED");
  return enrichRoom(room);
}
