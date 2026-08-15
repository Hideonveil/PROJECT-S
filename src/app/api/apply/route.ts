import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { activeRequest } from "@/lib/api";
import { createPlayingRoom } from "@/lib/room";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const me = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();
    const toUserId = String(body.toUserId || "");
    if (!toUserId || toUserId === me.id) return NextResponse.json({ error: "申请对象无效" }, { status: 400 });
    const { data: target } = await admin.from("profiles").select("id").eq("id", toUserId).maybeSingle();
    if (!target) return NextResponse.json({ error: "玩家不存在" }, { status: 404 });

    async function findPending(fromId: string, toId: string) {
      const { data } = await admin
        .from("applications")
        .select("*")
        .eq("from_user_id", fromId)
        .eq("to_user_id", toId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data || null;
    }

    const reverse = await findPending(toUserId, me.id);
    if (reverse) {
      const room = await createPlayingRoom(reverse, me.id, idempotencyKey(request));
      return jsonOk({ application: reverse, room }, rid);
    }

    const mine = await findPending(me.id, toUserId);
    if (mine) return jsonOk({ application: mine }, rid);

    const myRequest = await activeRequest(me.id);
    if (!myRequest) return NextResponse.json({ error: "请先发布匹配需求" }, { status: 409 });

    const { data: application, error } = await admin
      .from("applications")
      .insert({ from_user_id: me.id, to_user_id: toUserId, match_request_id: myRequest.id, status: "pending" })
      .select("*")
      .single();

    if (error && String(error.message || "").toLowerCase().includes("duplicate")) {
      const reverseAfterRace = await findPending(toUserId, me.id);
      if (reverseAfterRace) {
        const room = await createPlayingRoom(reverseAfterRace, me.id, idempotencyKey(request));
        return jsonOk({ application: reverseAfterRace, room }, rid);
      }
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await trackEvent({
      eventName: "application_sent",
      userId: me.id,
      matchRequestId: myRequest.id,
      requestId: idempotencyKey(request),
      properties: { applicationId: application.id },
    });
    return jsonOk({ application }, rid);
  } catch (error) {
    return errorResponse(error, rid, "申请失败，请稍后重试");
  }
}
