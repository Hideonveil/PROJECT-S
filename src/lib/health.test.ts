import { describe, expect, it, vi } from "vitest";

const probePresence = vi.hoisted(() => vi.fn());
const poolSummary = vi.hoisted(() => vi.fn());

vi.mock("./presence", () => ({ probePresence }));
vi.mock("./api", () => ({ poolSummary }));

import { runHealthDiagnostics } from "./health";

const counts = {
  online: 1,
  matching: 2,
  users: 3,
  playing: 4,
};

describe("health diagnostics", () => {
  it("returns a bounded ready result with per-check request IDs and timings", async () => {
    probePresence.mockResolvedValue(true);
    poolSummary.mockResolvedValue(counts);

    const result = await runHealthDiagnostics({ requestId: "health-1" });

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      status: "ready",
      requestId: "health-1",
      online: 1,
      matching: 2,
      users: 3,
      playing: 4,
      checks: {
        presence: { check: "presence", outcome: "success", success: true, timeout: false },
        database: { check: "database", outcome: "success", success: true, timeout: false },
      },
    });
    for (const check of Object.values(result.body.checks)) {
      expect(check.requestId).toEqual(expect.any(String));
      expect(check.startedAt).toEqual(expect.any(String));
      expect(check.durationMs).toEqual(expect.any(Number));
    }
  });

  it("returns degraded 503 when one Supabase check times out", async () => {
    probePresence.mockImplementation((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    poolSummary.mockResolvedValue(counts);

    const result = await runHealthDiagnostics({ requestId: "health-timeout", checkTimeoutMs: 10, deadlineMs: 100 });

    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({
      ok: false,
      status: "degraded",
      checks: {
        presence: { outcome: "timeout", success: false, timeout: true },
        database: { outcome: "success", success: true, timeout: false },
      },
    });
    expect(result.body.checks.presence.error).toEqual(expect.objectContaining({ message: expect.stringContaining("timed out") }));
  });

  it("returns a sanitized degraded result for a check error", async () => {
    probePresence.mockResolvedValue(true);
    poolSummary.mockRejectedValue(Object.assign(new Error("password=do-not-leak"), {
      code: "DB_DOWN",
      cause: Object.assign(new Error("Bearer secret-token"), { code: "ECONNRESET", syscall: "read" }),
    }));

    const result = await runHealthDiagnostics({ requestId: "health-error" });
    const serialized = JSON.stringify(result.body);

    expect(result.httpStatus).toBe(503);
    expect(result.body.checks.database).toMatchObject({ outcome: "error", success: false, timeout: false });
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("secret-token");
    expect(result.body.checks.database.error).toEqual(expect.objectContaining({
      cause: expect.objectContaining({ code: "ECONNRESET", syscall: "read" }),
    }));
  });

  it("returns unavailable when the overall health deadline wins", async () => {
    const pending = (signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    probePresence.mockImplementation(pending);
    poolSummary.mockImplementation(pending);

    const result = await runHealthDiagnostics({ requestId: "health-deadline", checkTimeoutMs: 1000, deadlineMs: 10 });

    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({
      ok: false,
      status: "unavailable",
      checks: {
        health_deadline: { outcome: "timeout", success: false, timeout: true },
      },
    });
  });

  it("aborts the underlying Supabase check when its timeout wins", async () => {
    let aborted = false;
    probePresence.mockImplementation((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }));
    poolSummary.mockResolvedValue(counts);

    const result = await runHealthDiagnostics({ requestId: "health-abort", checkTimeoutMs: 10, deadlineMs: 100 });

    expect(aborted).toBe(true);
    expect(result.body.checks.presence).toMatchObject({ outcome: "timeout", timeout: true });
  });
});
