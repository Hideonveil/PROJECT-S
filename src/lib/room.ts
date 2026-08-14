import { activeRequest, enrichRoom, generateRoomCode } from "./api";
import { needFromRequest } from "./data";
import { supabaseAdmin } from "./supabase";
import type { Application, Room } from "./types";

export async function createPlayingRoom(application: Application): Promise<Room> {
  const admin = supabaseAdmin();
  const fromRequest = await activeRequest(application.from_user_id);
  const need = fromRequest ? needFromRequest(fromRequest) : {};

  let roomId = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const { data: created, error } = await admin
      .from("rooms")
      .insert({ code, application_id: application.id, need, status: "playing", started_at: new Date().toISOString() })
      .select("*")
      .single();
    if (created) {
      roomId = created.id;
      break;
    }
    if (attempt === 5 || !String(error?.message || "").toLowerCase().includes("code")) {
      throw new Error(error?.message || "开房失败");
    }
  }

  await admin.from("room_members").insert([
    { room_id: roomId, user_id: application.from_user_id },
    { room_id: roomId, user_id: application.to_user_id },
  ]);

  for (const uid of [application.from_user_id, application.to_user_id]) {
    await admin
      .from("match_requests")
      .update({ status: "playing" })
      .eq("user_id", uid)
      .in("status", ["matching", "matched"]);
  }

  const { data: room } = await admin.from("rooms").select("*").eq("id", roomId).single();
  return enrichRoom(room);
}
