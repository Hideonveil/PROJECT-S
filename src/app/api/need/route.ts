import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { activeRequest, candidatesFor, poolCounts } from "@/lib/api";
import { needFromRequest } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase";
import type { NeedInput } from "@/lib/types";
import { errorResponse, idempotencyKey, jsonOk, requestId } from "@/lib/http";
import { trackEvent } from "@/lib/metrics";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await request.json();
    const profile = await requireRequestProfile(request, body);
    const admin = supabaseAdmin();

    const need: NeedInput = {
      game: String(body.need?.game || ""),
      mode: String(body.need?.mode || ""),
      goal: String(body.need?.goal || ""),
      current: Math.max(1, Number(body.need?.current || 1)),
      target: Math.max(2, Number(body.need?.target || 2)),
      time: String(body.need?.time || "现在开始"),
      duration: String(body.need?.duration || "90"),
      voice: body.need?.voice !== false,
      playerType: String(body.need?.playerType || ""),
      details: body.need?.details && typeof body.need.details === "object" ? body.need.details : {},
    };
    if (!need.game) return NextResponse.json({ error: "请选择游戏" }, { status: 400 });

    const active = await activeRequest(profile.id);
    if (active) {
      await admin.from("match_requests").update({ status: "cancelled" }).eq("id", active.id);
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const { data: inserted, error: insertError } = await admin
      .from("match_requests")
      .insert({
        user_id: profile.id,
        game_id: need.game,
        activity: need.mode,
        goal: need.goal,
        current_player_count: need.current,
        needed_player_count: need.target,
        play_time: need.time,
        duration: need.duration,
        voice_required: need.voice,
        desired_player_type: need.playerType,
        details: need.details || {},
        status: "matching",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    await admin.from("profiles").update({ online: true, last_seen: new Date().toISOString() }).eq("id", profile.id);

    const myNeed = needFromRequest(inserted);
    const candidates = await candidatesFor(profile, myNeed);
    const counts = await poolCounts();
    await trackEvent({
      eventName: "match_request_created",
      userId: profile.id,
      matchRequestId: inserted.id,
      requestId: idempotencyKey(request),
      properties: { game: need.game },
    });
    return jsonOk({
      requestId: inserted.id,
      candidates,
      ...counts,
    }, rid);
  } catch (error) {
    return errorResponse(error, rid, "匹配失败，请稍后重试");
  }
}
