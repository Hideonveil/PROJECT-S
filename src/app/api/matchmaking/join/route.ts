import { requireRequestProfile } from "@/lib/auth";
import { AppError, errorResponse, idempotencyKey, jsonBody, jsonOk, requestId } from "@/lib/http";
import { joinPublicTicket } from "@/lib/matchmaking/service";

// Ticket ids are standard UUIDs. Keep the structural guard version-agnostic
// (v4 and v7 are both valid in deployed Postgres environments); ownership and
// state are revalidated by joinPublicTicket against the database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const rid = requestId(request);
  let userId: string | null = null;
  let ticketId: string | null = null;
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    userId = profile.id;
    ticketId = String(body.ticketId || "").trim();
    if (!UUID.test(ticketId)) {
      throw new AppError("DIRECT_JOIN_INVALID", "请选择有效的匹配对象", 422);
    }
    return jsonOk(await joinPublicTicket(profile.id, ticketId, idempotencyKey(request)), rid);
  } catch (error) {
    return errorResponse(error, rid, "加入对方匹配失败，请重新选择", {
      userId,
      ticketId,
      action: "matchmaking.join",
      route: "/api/matchmaking/join",
    });
  }
}
