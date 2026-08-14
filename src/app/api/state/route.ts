import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import {
  activeRequest,
  activeRoomFor,
  activeSessionFor,
  enrichedApplications,
  friendsFor,
  poolCounts,
  profileWithGames,
  publicNeeds,
  recentConnectionsFor,
} from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/lib/types";

function mapSession(s: Session | null) {
  if (!s) return null;
  return {
    id: s.id,
    roomCode: s.room_code,
    players: s.players,
    need: s.need,
    outcomeBy: s.outcome_by,
    rematchBy: s.rematch_by,
    status: s.status,
    createdAt: s.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("*").eq("auth_user_id", authUser.id).maybeSingle();
    if (!profile) return NextResponse.json({ error: "请先创建游戏身份" }, { status: 400 });

    const nowIso = new Date().toISOString();
    const lastSeenAt = profile.last_seen ? new Date(profile.last_seen).getTime() : 0;
    if (Date.now() - lastSeenAt > 20000) {
      await admin.from("profiles").update({ online: true, last_seen: nowIso }).eq("id", profile.id);
    }

    const { data: pendingApps } = await admin
      .from("applications")
      .select("*")
      .eq("to_user_id", profile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const [counts, needs, friends, applications, room, session, activeReq, recentConnections] = await Promise.all([
      poolCounts(),
      publicNeeds(),
      friendsFor(profile.id),
      enrichedApplications(pendingApps || []),
      activeRoomFor(profile.id),
      activeSessionFor(profile.id),
      activeRequest(profile.id),
      recentConnectionsFor(profile.id),
    ]);

    return NextResponse.json({
      user: await profileWithGames(profile),
      online: counts.online,
      matching: counts.matching,
      needs,
      friends,
      applications,
      room,
      session: mapSession(session),
      matchRequestId: activeReq?.id || null,
      recentConnections,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "状态获取失败" }, { status: 500 });
  }
}