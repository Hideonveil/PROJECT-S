import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  try {
    code = (await params).code;
    const me = await requireRequestProfile(request);
    const admin = supabaseAdmin();
    const { data: room, error: roomError } = await admin.from("rooms").select("id").eq("code", code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "房间不存在", 404);
    const { data: member, error: memberError } = await admin
      .from("room_members")
      .select("status")
      .eq("room_id", room.id)
      .eq("user_id", me.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== "active") throw new AppError("ROOM_MEMBER_INACTIVE", "你已不在这个 Room", 409);
    const { data: messages, error: messageError } = await admin
      .from("messages")
      .select("*")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (messageError) throw messageError;
    return jsonOk({ messages: (messages || []).reverse() }, rid);
  } catch (error) {
    return errorResponse(error, rid, "聊天记录获取失败，请重试", { action: "room_chat_history", route: `/api/room/${code || ":code"}/messages` });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rid = requestId(request);
  let code = "";
  try {
    code = (await params).code;
    const body = await jsonBody(request);
    const me = await requireRequestProfile(request, body);
    const content = String(body.content || "").trim().slice(0, 500);
    const operationId = String(body.operationId || "").trim().slice(0, 120);
    if (!content) throw new AppError("CHAT_EMPTY", "请输入消息", 422);
    if (!operationId) throw new AppError("CHAT_OPERATION_REQUIRED", "消息缺少操作编号", 422);
    const admin = supabaseAdmin();
    const { data: room, error: roomError } = await admin.from("rooms").select("id").eq("code", code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "房间不存在", 404);
    const { data: member } = await admin.from("room_members").select("status").eq("room_id", room.id).eq("user_id", me.id).maybeSingle();
    if (!member || member.status !== "active") throw new AppError("ROOM_MEMBER_INACTIVE", "你已不在这个 Room", 409);
    const { data: existing } = await admin.from("messages").select("*").eq("sender_id", me.id).eq("client_operation_id", operationId).maybeSingle();
    if (existing) return jsonOk({ message: existing, reused: true }, rid);
    const { data: created, error: insertError } = await admin.from("messages").insert({
      room_id: room.id,
      sender_id: me.id,
      content,
      kind: "chat",
      client_operation_id: operationId,
    }).select("*").single();
    if (insertError) {
      const { data: raced } = await admin.from("messages").select("*").eq("sender_id", me.id).eq("client_operation_id", operationId).maybeSingle();
      if (raced) return jsonOk({ message: raced, reused: true }, rid);
      throw insertError;
    }
    return jsonOk({ message: created, reused: false }, rid);
  } catch (error) {
    return errorResponse(error, rid, "消息发送失败，请重试", { action: "room_chat", route: `/api/room/${code || ":code"}/messages` });
  }
}
