import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
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
import { errorResponse, requestId } from "@/lib/http";
import { mapSession } from "@/lib/session";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);
    const admin = supabaseAdmin();

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
      playing: counts.playing,
      needs,
      friends,
      applications,
      room,
      session: mapSession(session),
      matchRequestId: activeReq?.id || null,
      recentConnections,
    });
  } catch (error) {
    return errorResponse(error, rid, "状态获取失败，请稍后重试");
  }
}
