import { AppError } from "../http";
import { forceOpsCasualAttach, forceOpsRankedMatch, previewOpsCasualAttach, previewOpsRankedMatch } from "../matchmaking/service";
import { appendOpsAudit } from "./audit";

export async function previewRankedMatch(userA: string, userB: string) {
  const preview = await previewOpsRankedMatch(userA, userB);
  return { compatible: preview.compatibility.compatible, hardFailures: preview.compatibility.hardFailures, softSignals: preview.compatibility.softSignals, users: [preview.ticketA.user_id, preview.ticketB.user_id] };
}

export async function forceRankedMatch(input: { operator: string; userA: string; userB: string; reason: string; requestId: string }) {
  if (!input.reason.trim()) throw new AppError("OPS_REASON_REQUIRED", "请填写人工操作原因", 422, false);
  const preview = await previewOpsRankedMatch(input.userA, input.userB);
  const beforeState = { ticketA: { id: preview.ticketA.id, state: preview.ticketA.state }, ticketB: { id: preview.ticketB.id, state: preview.ticketB.state } };
  try {
    const result = await forceOpsRankedMatch(input.userA, input.userB, input.reason, input.requestId);
    await appendOpsAudit({ operator: input.operator, action: "ADMIN_FORCE_RANKED_MATCH", targetUserId: input.userA, targetRoomId: result.roomId, beforeState, result, reason: input.reason });
    return result;
  } catch (error) {
    await appendOpsAudit({ operator: input.operator, action: "ADMIN_FORCE_RANKED_MATCH", targetUserId: input.userA, beforeState, result: { status: "failed", code: error instanceof AppError ? error.code : "INTERNAL_ERROR" }, reason: input.reason });
    throw error;
  }
}

export async function previewCasualAttach(userId: string, groupId: string) {
  const preview = await previewOpsCasualAttach(userId, groupId);
  return { compatible: preview.compatibility.compatible, hardFailures: preview.compatibility.hardFailures, softSignals: preview.compatibility.softSignals, groupId, roomId: preview.group.room_id || null, formationState: preview.group.state };
}

export async function attachCasualUser(input: { operator: string; userId: string; groupId: string; reason: string }) {
  if (!input.reason.trim()) throw new AppError("OPS_REASON_REQUIRED", "请填写人工操作原因", 422, false);
  const preview = await previewOpsCasualAttach(input.userId, input.groupId);
  const beforeState = { ticket: { id: preview.ticket.id, state: preview.ticket.state }, group: { id: preview.group.id, state: preview.group.state } };
  try {
    const result = await forceOpsCasualAttach(input.userId, input.groupId, input.reason);
    await appendOpsAudit({ operator: input.operator, action: "ADMIN_ATTACH_CASUAL_USER", targetUserId: input.userId, targetRoomId: result.roomId, beforeState, result, reason: input.reason });
    return result;
  } catch (error) {
    await appendOpsAudit({ operator: input.operator, action: "ADMIN_ATTACH_CASUAL_USER", targetUserId: input.userId, beforeState, result: { status: "failed", code: error instanceof AppError ? error.code : "INTERNAL_ERROR" }, reason: input.reason });
    throw error;
  }
}
