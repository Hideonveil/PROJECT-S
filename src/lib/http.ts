import { NextResponse } from "next/server";
import { reportServerError } from "./metrics";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false
  ) {
    super(message);
  }
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id") || crypto.randomUUID();
}

export function idempotencyKey(request: Request): string | null {
  return request.headers.get("idempotency-key") || request.headers.get("x-request-id");
}

export function bearerToken(request: Request, legacyBody?: Record<string, unknown>): string {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  // One-release compatibility path for cached clients. GET endpoints never
  // pass a legacy body, so access tokens no longer appear in URLs.
  return String(legacyBody?.token || "");
}

export function jsonOk(data: Record<string, unknown>, requestIdValue: string, status = 200) {
  return NextResponse.json({ ...data, meta: { requestId: requestIdValue } }, { status });
}

export function errorResponse(error: unknown, requestIdValue: string, fallback = "操作失败") {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      reportServerError({ error, requestId: requestIdValue, code: error.code, fallback });
    }
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId: requestIdValue,
          retryable: error.retryable,
        },
      },
      { status: error.status }
    );
  }

  const raw = error instanceof Error ? error.message : "";
  const mapped = mapDatabaseError(raw, fallback);
  reportServerError({ error, requestId: requestIdValue, code: mapped.code, fallback });
  return NextResponse.json(
    {
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: requestIdValue,
        retryable: mapped.retryable,
      },
    },
    { status: mapped.status }
  );
}

function mapDatabaseError(raw: string, fallback: string) {
  const known: Record<string, { code: string; message: string; status: number; retryable: boolean }> = {
    APPLICATION_FORBIDDEN: { code: "APPLICATION_FORBIDDEN", message: "这个申请不能由你处理", status: 403, retryable: false },
    APPLICATION_ALREADY_RESOLVED: { code: "APPLICATION_ALREADY_RESOLVED", message: "这个申请已经处理过了", status: 409, retryable: false },
    SESSION_FORBIDDEN: { code: "SESSION_FORBIDDEN", message: "你不是这个 Session 的成员", status: 403, retryable: false },
    SESSION_STATE_CONFLICT: { code: "SESSION_STATE_CONFLICT", message: "当前 Session 状态不允许这个操作", status: 409, retryable: false },
    SESSION_NOT_COMPLETED: { code: "SESSION_NOT_COMPLETED", message: "Session 结束后才能选择再玩一次", status: 409, retryable: false },
    REMATCH_CHOICE_INVALID: { code: "REMATCH_CHOICE_INVALID", message: "再玩选择无效", status: 422, retryable: false },
    RANK_REQUIRED: { code: "RANK_REQUIRED", message: "天梯匹配必须选择当前段位", status: 422, retryable: false },
    MATCH_RULE_SET_MISSING: { code: "MATCH_RULE_SET_MISSING", message: "匹配规则暂不可用", status: 503, retryable: true },
    MATCH_RESERVATION_CONFLICT: { code: "MATCH_RESERVATION_CONFLICT", message: "候选刚刚被其他匹配占用，正在继续寻找", status: 409, retryable: true },
    PAIR_STATE_CONFLICT: { code: "PAIR_STATE_CONFLICT", message: "这次候选状态已经变化", status: 409, retryable: true },
    PAIR_CONFIRMATION_EXPIRED: { code: "PAIR_CONFIRMATION_EXPIRED", message: "确认已超时，已经重新进入匹配池", status: 409, retryable: true },
    PAIR_FORBIDDEN: { code: "PAIR_FORBIDDEN", message: "你不能操作这次匹配", status: 403, retryable: false },
    CONFIRMATION_INVALID: { code: "CONFIRMATION_INVALID", message: "确认操作无效", status: 422, retryable: false },
    MATCH_NOT_COMPLETED: { code: "MATCH_NOT_COMPLETED", message: "游戏结束后才能提交体验反馈", status: 409, retryable: false },
    MATCH_ALREADY_CONNECTED: { code: "MATCH_ALREADY_CONNECTED", message: "已经建立 Session，请从房间内退出", status: 409, retryable: false },
    GOODBYE_REQUEST_INVALID: { code: "GOODBYE_REQUEST_INVALID", message: "请选择是否结束本次匹配", status: 422, retryable: false },
    FRIEND_PROFILE_NOT_FOUND: { code: "FRIEND_PROFILE_NOT_FOUND", message: "没有找到这个玩家", status: 404, retryable: false },
    FRIEND_DECISION_INVALID: { code: "FRIEND_DECISION_INVALID", message: "请选择接受或拒绝", status: 422, retryable: false },
    FRIEND_REQUEST_NOT_FOUND: { code: "FRIEND_REQUEST_NOT_FOUND", message: "这个好友申请已经不存在", status: 404, retryable: false },
    FRIEND_REQUEST_STATE_CONFLICT: { code: "FRIEND_REQUEST_STATE_CONFLICT", message: "这个好友申请已经处理过了", status: 409, retryable: false },
    FRIEND_BLOCKED: { code: "FRIEND_BLOCKED", message: "当前不能向这个玩家发送好友申请", status: 403, retryable: false },
    FRIEND_SELF_FORBIDDEN: { code: "FRIEND_SELF_FORBIDDEN", message: "不能添加自己为好友", status: 422, retryable: false },
  };
  const key = Object.keys(known).find((candidate) => raw.includes(candidate));
  return key
    ? known[key]
    : { code: "INTERNAL_ERROR", message: fallback, status: 500, retryable: true };
}
