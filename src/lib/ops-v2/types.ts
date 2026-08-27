export type OpsV2Actor = {
  operator: string;
};

export type OpsAuditInput = {
  operator: string;
  action: string;
  targetUserId?: string | null;
  targetRoomId?: string | null;
  beforeState?: Record<string, unknown>;
  result: Record<string, unknown>;
  reason?: string | null;
};
