import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildActionEvent,
  CapacityTimeoutError,
  classifyMutationOutcome,
  createAppendOnlyLedger,
  serializeError,
  withTimeout,
} from "../tools/capacity/evidence.mjs";
import {
  closeClient,
  markOnline,
  refreshState,
  statefulRequest,
  startHeartbeat,
  subscribeChannel,
  waitForTerminal,
  waitForRooms,
} from "../tools/capacity/stateful-adapter.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function runtime() {
  return {
    actorId: "R01",
    userId: "user-r01",
    accessToken: "token-only-in-memory",
    refreshToken: "refresh-only-in-memory",
    state: { user: { id: "user-r01" }, matchmaking: {}, room: null, session: null },
    ids: {},
    realtimeTimeoutMs: 5,
    cleanupTimeoutMs: 5,
    realtime: [],
    realtimeLedger: [],
    presence: [],
    roomChannels: new Set(),
  };
}

async function ledgerFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jiyuan-capacity-evidence-"));
  const writer = await createAppendOnlyLedger({ directory });
  const ledger = { runId: "cap-evidence-test", requestCount: 0, events: [], writer, mutationBlocked: false, stageDeadline: 0 };
  return { directory, ledger };
}

function options(overrides = {}) {
  return {
    runId: "cap-evidence-test",
    baseUrl: "http://capacity.test",
    requestTimeoutMs: 10,
    maxRequests: 100,
    durationSec: 1,
    ...overrides,
  };
}

function abortableHang(init = {}) {
  return new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("aborted by test controller")), { once: true });
  });
}

describe("stateful evidence ledger", () => {
  it("appends complete action records before a final summary exists", async () => {
    const { directory, ledger } = await ledgerFixture();
    try {
      const event = buildActionEvent({
        runId: ledger.runId,
        actorId: "R01",
        action: "matchmaking.start",
        endpoint: "/api/matchmaking/start",
        requestId: "request-1",
        startedAt: "2026-08-24T00:00:00.000Z",
        finishedAt: "2026-08-24T00:00:00.010Z",
        latencyMs: 10,
        httpStatus: 200,
        identifiers: { ticket_id: "ticket-1" },
        expectedState: "ticket active",
        actualState: { ticket_id: "ticket-1" },
        mutationOutcome: "COMMITTED_RESPONSE_RECEIVED",
      });
      await ledger.writer.append(event);
      const lines = (await readFile(path.join(directory, "lifecycle-ledger.ndjson"), "utf8")).trim().split("\n");
      const saved = JSON.parse(lines[0]);
      expect(saved).toMatchObject({
        run_id: "cap-evidence-test",
        actor_id: "R01",
        action: "matchmaking.start",
        endpoint: "/api/matchmaking/start",
        request_id: "request-1",
        http_status: 200,
        ticket_id: "ticket-1",
        expected_state: "ticket active",
        mutation_outcome: "COMMITTED_RESPONSE_RECEIVED",
      });
      expect(saved).toHaveProperty("started_at");
      expect(saved).toHaveProperty("finished_at");
      expect(saved).toHaveProperty("latency_ms");
      expect(saved).toHaveProperty("error");
      expect(saved).toHaveProperty("actual_state");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves raw Node cause fields while redacting secrets", () => {
    const cause = Object.assign(new Error("socket reset Bearer should-not-leak"), {
      code: "ECONNRESET",
      syscall: "read",
      address: "203.0.113.10",
      port: 443,
    });
    const error = new TypeError("fetch failed", { cause });
    const serialized = serializeError(error);
    expect(serialized).toMatchObject({ name: "TypeError", message: "fetch failed", cause_code: "ECONNRESET" });
    expect(serialized.cause).toMatchObject({ code: "ECONNRESET", syscall: "read", address: "203.0.113.10", port: 443 });
    expect(JSON.stringify(serialized)).not.toContain("Bearer should-not-leak");
  });

  it.each(["auth", "request", "matching_wait", "realtime_wait", "stage", "cleanup"])('uses typed timeout source "%s"', async (source) => {
    await expect(withTimeout(new Promise(() => {}), 1, source)).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: source, code: "CAPACITY_TIMEOUT" });
  });

  it("classifies a committed mutation whose response was lost", () => {
    expect(classifyMutationOutcome({
      beforeState: { ticket_id: null },
      afterState: { ticket_id: "ticket-1" },
      expectedState: (state) => state.ticket_id === "ticket-1",
    })).toBe("COMMITTED_RESPONSE_LOST");
  });
});

describe("stateful request timeout safety", () => {
  it("counts a ready session as active while waiting for rooms", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    actor.client = {
      channel() {
        return { on() {}, subscribe(callback) { callback("SUBSCRIBED"); } };
      },
    };
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      user: { id: actor.userId },
      room: { id: "room-ready", code: "READY01" },
      session: { id: "session-ready", status: "ready" },
      matchmaking: {},
    }), { status: 200 })));
    try {
      await expect(waitForRooms(new Map([[actor.actorId, actor]]), 1, options({ durationSec: 1, statePollIntervalMs: 0, statePollJitterMs: 0 }), "40", ledger)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("coalesces concurrent state hydration for one actor", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    let release;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ user: { id: actor.userId }, matchmaking: {} }), { status: 200 }));
    }));
    try {
      const first = refreshState(actor, options(), "5", ledger, "state.poll.1");
      const second = refreshState(actor, options(), "5", ledger, "state.poll.2");
      release();
      await Promise.all([first, second]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(ledger.events.some((event) => event.action === "state.poll.2.deduplicated")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not overlap heartbeat requests when a tick is still in flight", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    let resolveRequest;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => {
      resolveRequest = () => resolve(new Response(JSON.stringify({ online: true }), { status: 200 }));
    }));
    try {
      startHeartbeat(actor, options({ heartbeatIntervalMs: 5, requestTimeoutMs: 100 }), "5", ledger);
      await new Promise((resolve) => setTimeout(resolve, 8));
      await new Promise((resolve) => setTimeout(resolve, 8));
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      resolveRequest();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await closeClient(actor);
    } finally {
      await closeClient(actor).catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retries one transient reset only for the idempotent online presence call", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    let calls = 0;
    globalThis.fetch = vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) }));
      return Promise.resolve(new Response(JSON.stringify({ online: true }), { status: 200 }));
    });
    try {
      await expect(markOnline(actor, options(), "5", ledger)).resolves.toMatchObject({ status: 200 });
      expect(calls).toBe(2);
      expect(ledger.events.some((event) => event.action === "presence.online.transport_retry")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("records request timeout, reconciles read-only, and never retries the mutation", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    let calls = 0;
    globalThis.fetch = vi.fn((url, init) => {
      calls += 1;
      if (init.method === "POST") return abortableHang(init);
      if (String(url).endsWith("/api/state")) {
        return Promise.resolve(new Response(JSON.stringify({ user: { id: actor.userId }, matchmaking: { ticket: { id: "ticket-committed" } } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ authenticated: true, profile: { id: actor.userId } }), { status: 200 }));
    });
    try {
      await expect(statefulRequest({
        runtime: actor,
        options: options({ requestTimeoutMs: 5 }),
        stage: "5",
        action: "matchmaking.start",
        method: "POST",
        requestPath: "/api/matchmaking/start",
        body: { match: { mode: "ranked" } },
        expectedState: { label: "ticket active", predicate: (state) => state.ticket_id === "ticket-committed" },
        ledger,
      })).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "request" });
      await ledger.writer.flush();
      const events = (await readFile(path.join(directory, "lifecycle-ledger.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
      const mutation = events.find((event) => event.action === "matchmaking.start");
      expect(calls).toBe(3); // one POST, then state/session reconciliation GETs
      expect(ledger.mutationBlocked).toBe(true);
      expect(mutation).toMatchObject({ mutation_outcome: "COMMITTED_RESPONSE_LOST", error: { name: "TimeoutError", timeout_source: "request" } });
      expect(events.filter((event) => event.action === "matchmaking.start")).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks a second mutation after an unresolved timeout", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    globalThis.fetch = vi.fn((url, init) => abortableHang(init));
    try {
      await expect(statefulRequest({ runtime: actor, options: options({ requestTimeoutMs: 2 }), stage: "5", action: "matchmaking.start", method: "POST", requestPath: "/api/matchmaking/start", body: {}, ledger })).rejects.toMatchObject({ name: "TimeoutError" });
      const callsAfterTimeout = globalThis.fetch.mock.calls.length;
      await expect(statefulRequest({ runtime: actor, options: options({ requestTimeoutMs: 2 }), stage: "5", action: "matchmaking.cancel", method: "POST", requestPath: "/api/matchmaking/cancel", body: {}, ledger })).rejects.toMatchObject({ name: "MutationHaltedError", code: "CAPACITY_MUTATION_HALTED" });
      expect(globalThis.fetch.mock.calls.length).toBe(callsAfterTimeout);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("classifies preflight stage timeout without sending a request", async () => {
    const { directory, ledger } = await ledgerFixture();
    const actor = runtime();
    ledger.stageDeadline = Date.now() - 1;
    globalThis.fetch = vi.fn();
    try {
      await expect(statefulRequest({ runtime: actor, options: options(), stage: "5", action: "state.read", requestPath: "/api/state", ledger })).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "stage" });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses auth timeout for the authentication boundary", async () => {
    const { fetchJson } = await import("../tools/capacity/runner.mjs");
    globalThis.fetch = vi.fn((url, init) => abortableHang(init));
    await expect(fetchJson({ url: "http://capacity.test/api/auth/login", method: "POST", timeoutMs: 2, timeoutSource: "auth" })).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "auth" });
  });

  it("classifies matching wait timeout", async () => {
    const { directory, ledger } = await ledgerFixture();
    globalThis.fetch = vi.fn();
    try {
      await expect(waitForRooms(new Map(), 1, { durationSec: 0 }, "5", ledger)).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "matching_wait" });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("classifies terminal convergence timeout as a stage timeout", async () => {
    const { directory, ledger } = await ledgerFixture();
    try {
      await expect(waitForTerminal(new Map(), options(), "5", ledger, 0)).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "stage" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("classifies realtime subscription timeout", async () => {
    const actor = runtime();
    actor.client = {
      channel() {
        return { on() {}, subscribe() {} };
      },
    };
    await expect(subscribeChannel(actor, "5", "test-channel", () => {})).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "realtime_wait" });
  });

  it("classifies cleanup timeout without retrying channel removal", async () => {
    const actor = runtime();
    actor.client = { removeAllChannels: vi.fn(() => new Promise(() => {})) };
    await expect(closeClient(actor)).rejects.toMatchObject({ name: "TimeoutError", timeoutSource: "cleanup" });
    expect(actor.client.removeAllChannels).toHaveBeenCalledTimes(1);
  });
});
