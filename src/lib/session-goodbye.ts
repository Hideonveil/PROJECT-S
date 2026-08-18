import { AppError } from "./http";

export type GoodbyeCommand = {
  requested: boolean;
};

export type GoodbyeRequestView = {
  userId: string;
  requestedAt: string;
};

export function parseGoodbyeCommand(input: unknown): GoodbyeCommand {
  if (!input || typeof input !== "object" || typeof (input as { requested?: unknown }).requested !== "boolean") {
    throw new AppError("GOODBYE_REQUEST_INVALID", "请选择是否结束本次匹配", 422);
  }
  return { requested: (input as { requested: boolean }).requested };
}

export function mapGoodbyeRequests(rows: unknown[]): GoodbyeRequestView[] {
  return rows
    .filter(
      (row): row is { user_id: string; requested_at: string } =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as { user_id?: unknown }).user_id === "string" &&
            typeof (row as { requested_at?: unknown }).requested_at === "string"
        )
    )
    .map((row) => ({ userId: row.user_id, requestedAt: row.requested_at }))
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}
