import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { activeRoomFor, activeSessionFor, friendsFor, poolCounts, profileWithGames, recentConnectionsFor } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, requestId } from "@/lib/http";
import { mapSession } from "@/lib/session";
import { matchmakingStatus } from "@/lib/matchmaking/service";

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

    const [counts, friends, room, session, recentConnections, matchmaking] = await Promise.all([
      poolCounts(),
      friendsFor(profile.id),
      activeRoomFor(profile.id),
      activeSessionFor(profile.id),
      recentConnectionsFor(profile.id),
      matchmakingStatus(profile.id),
    ]);

    return NextResponse.json({
      user: await profileWithGames(profile),
      online: counts.online,
      matching: counts.matching,
      playing: counts.playing,
      friends,
      room,
      session: mapSession(session),
      recentConnections,
      matchmaking,
    });
  } catch (error) {
    return errorResponse(error, rid, "状态获取失败，请稍后重试");
  }
}
