import { NextResponse } from "next/server";
import { requireRequestProfile } from "@/lib/auth";
import { activeRoomFor, activeSessionFor, completedSessionViewFor, friendsFor, poolSummary, profileWithGames, recentConnectionsFor } from "@/lib/api";
import { errorResponse, requestId } from "@/lib/http";
import { mapSession } from "@/lib/session";
import { matchmakingStatus } from "@/lib/matchmaking/service";
import { friendRequestsFor } from "@/lib/friendships";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const profile = await requireRequestProfile(request);

    const [counts, friends, friendRequests, room, session, recentConnections, matchmaking] = await Promise.all([
      poolSummary(),
      friendsFor(profile.id),
      friendRequestsFor(profile.id),
      activeRoomFor(profile.id),
      activeSessionFor(profile.id).then((active) => active ? mapSession(active) : completedSessionViewFor(profile.id)),
      recentConnectionsFor(profile.id),
      // A state snapshot is read-only. Updating matchmaking here creates a
      // realtime feedback loop: table change -> snapshot -> table change.
      // Replaced the old matchmakingStatus(profile.id, false) heartbeat flag:
      // status reads are now intrinsically read-only.
      matchmakingStatus(profile.id),
    ]);

    return NextResponse.json({
      user: await profileWithGames(profile),
      online: counts.online,
      matching: counts.matching,
      playing: counts.playing,
      friends,
      friendRequests,
      room,
      session,
      recentConnections,
      matchmaking,
    });
  } catch (error) {
    return errorResponse(error, rid, "状态获取失败，请稍后重试");
  }
}
