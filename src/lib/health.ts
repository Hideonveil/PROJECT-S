import { randomUUID } from "node:crypto";
import { poolSummary, type PoolSummary } from "./api";
import { probePresence } from "./presence";

export const HEALTH_CHECK_TIMEOUT_MS = 2_000;
export const HEALTH_DEADLINE_MS = 5_000;

type CheckOutcome = "success" | "timeout" | "error";

export type HealthCheckResult = {
  check: string;
  requestId: string;
  startedAt: string;
  durationMs: number;
  outcome: CheckOutcome;
  success: boolean;
  timeout: boolean;
  error: {
    name: string;
    message: string;
    code: string | null;
    cause: {
      name: string | null;
      message: string;
      code: string | null;
      syscall: string | null;
    } | null;
  } | null;
};

export type HealthDiagnosticsBody = {
  ok: boolean;
  status: "ready" | "degraded" | "unavailable";
  checkedAt: string;
  requestId: string;
  databaseLatencyMs: number;
  checks: Record<string, HealthCheckResult>;
  online?: number;
  matching?: number;
  users?: number;
  playing?: number;
};

type HealthDependencies = {
  presence: (signal: AbortSignal) => Promise<unknown>;
  counts: (signal: AbortSignal) => Promise<PoolSummary>;
};

function redact(value: unknown): string {
  return String(value ?? "unknown")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access[_-]?token|refresh[_-]?token|password|secret|service[_-]?role)[=:]\s*[^\s,}]+/gi, "$1=[REDACTED]")
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, "[REDACTED_URL]");
}

function serializeError(error: unknown): HealthCheckResult["error"] {
  if (!error) return null;
  const source = error as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
  const cause = source.cause && typeof source.cause === "object"
    ? source.cause as { name?: unknown; message?: unknown; code?: unknown; syscall?: unknown }
    : null;
  return {
    name: redact(source.name || "Error"),
    message: redact(source.message || error),
    code: source.code == null ? null : redact(source.code),
    cause: cause
      ? {
          name: cause.name == null ? null : redact(cause.name),
          message: redact(cause.message || cause),
          code: cause.code == null ? null : redact(cause.code),
          syscall: cause.syscall == null ? null : redact(cause.syscall),
        }
      : null,
  };
}

function timeoutError(check: string, timeoutMs: number): Error {
  const error = new Error(`${check} health check timed out after ${timeoutMs}ms`);
  error.name = "HealthCheckTimeout";
  Object.assign(error, { code: "HEALTH_CHECK_TIMEOUT" });
  return error;
}

async function runCheck<T>(
  check: string,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<{ result: HealthCheckResult; value?: T }> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const requestId = randomUUID();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = timeoutError(check, timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));

  try {
    const value = await Promise.race([operationPromise, timeout]);
    return {
      value,
      result: {
        check,
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        outcome: "success",
        success: true,
        timeout: false,
        error: null,
      },
    };
  } catch (error) {
    const isTimeout = (error as { name?: string })?.name === "HealthCheckTimeout";
    return {
      result: {
        check,
        requestId,
        startedAt,
        durationMs: Date.now() - startedMs,
        outcome: isTimeout ? "timeout" : "error",
        success: false,
        timeout: isTimeout,
        error: serializeError(error),
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

export async function runHealthDiagnostics({
  requestId,
  checkTimeoutMs = HEALTH_CHECK_TIMEOUT_MS,
  deadlineMs = HEALTH_DEADLINE_MS,
  dependencies = {
    presence: probePresence,
    counts: (signal) => poolSummary({ strict: true, cache: false, signal }),
  },
}: {
  requestId: string;
  checkTimeoutMs?: number;
  deadlineMs?: number;
  dependencies?: HealthDependencies;
}): Promise<{ httpStatus: 200 | 503; body: HealthDiagnosticsBody }> {
  const startedMs = Date.now();
  const checks: Record<string, HealthCheckResult> = {};
  let counts: PoolSummary | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTriggered = false;
  const overallController = new AbortController();

  const executeChecks = async () => {
    const presence = await runCheck("presence", dependencies.presence, checkTimeoutMs, overallController.signal);
    checks.presence = presence.result;
    if (overallController.signal.aborted) return;

    const database = await runCheck("database", dependencies.counts, checkTimeoutMs, overallController.signal);
    checks.database = database.result;
    counts = database.value;
  };

  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      deadlineTriggered = true;
      const error = timeoutError("health_deadline", deadlineMs);
      overallController.abort(error);
      reject(error);
    }, deadlineMs);
  });

  try {
    await Promise.race([executeChecks(), deadline]);
  } catch (error) {
    if (deadlineTriggered) {
      checks.health_deadline = {
        check: "health_deadline",
        requestId: randomUUID(),
        startedAt: new Date(startedMs).toISOString(),
        durationMs: Date.now() - startedMs,
        outcome: "timeout",
        success: false,
        timeout: true,
        error: serializeError(error),
      };
    } else {
      checks.health = {
        check: "health",
        requestId: randomUUID(),
        startedAt: new Date(startedMs).toISOString(),
        durationMs: Date.now() - startedMs,
        outcome: "error",
        success: false,
        timeout: false,
        error: serializeError(error),
      };
    }
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (!overallController.signal.aborted) overallController.abort();
  }

  const failed = deadlineTriggered || Object.values(checks).some((check) => !check.success);
  const status = deadlineTriggered ? "unavailable" : failed ? "degraded" : "ready";
  const body: HealthDiagnosticsBody = {
    ok: status === "ready",
    status,
    checkedAt: new Date().toISOString(),
    requestId,
    databaseLatencyMs: Date.now() - startedMs,
    checks,
    ...(counts || {}),
  };

  return { httpStatus: status === "ready" ? 200 : 503, body };
}
