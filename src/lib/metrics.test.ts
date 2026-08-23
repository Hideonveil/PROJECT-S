import { describe, expect, it, vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));

vi.mock("./supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

import { buildServerErrorRecord, reportServerError, safeEventProperties } from "./metrics";

describe("P1 metrics safety", () => {
  it("keeps only small primitive properties", () => {
    const input = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
      `key-${index}`,
      index === 0 ? "x".repeat(400) : index,
    ]));
    const output = safeEventProperties(input);
    expect(Object.keys(output)).toHaveLength(20);
    expect(String(output["key-0"])).toHaveLength(240);
  });

  it("drops nested objects that could contain private payloads", () => {
    expect(safeEventProperties({ safe: true, nested: { token: "secret" } })).toEqual({
      safe: true,
      nested: undefined,
    });
  });

  it("builds a server error record with available business context", () => {
    expect(
      buildServerErrorRecord({
        error: new Error("boom"),
        requestId: "req-1",
        code: "SESSION_STATE_CONFLICT",
        context: {
          userId: "user-1",
          roomId: "room-1",
          sessionId: "session-1",
          ticketId: "ticket-1",
          action: "goodbye",
          route: "/api/room/30357/goodbye",
          timestamp: "2026-08-23T00:00:00.000Z",
        },
      })
    ).toEqual({
      level: "error",
      event: "server_error",
      user_id: "user-1",
      room_id: "room-1",
      session_id: "session-1",
      ticket_id: "ticket-1",
      request_id: "req-1",
      action: "goodbye",
      route: "/api/room/30357/goodbye",
      timestamp: "2026-08-23T00:00:00.000Z",
      code: "SESSION_STATE_CONFLICT",
      error_name: "Error",
    });
  });

  it("keeps absent business context explicitly empty", () => {
    expect(
      buildServerErrorRecord({
        error: new Error("boom"),
        requestId: "req-2",
        code: "INTERNAL_ERROR",
      })
    ).toMatchObject({
      user_id: null,
      room_id: null,
      session_id: null,
      ticket_id: null,
      request_id: "req-2",
      action: null,
      route: null,
      code: "INTERNAL_ERROR",
      error_name: "Error",
    });
    expect(typeof buildServerErrorRecord({
      error: new Error("boom"),
      requestId: "req-2",
      code: "INTERNAL_ERROR",
    }).timestamp).toBe("string");
  });

  it("emits a searchable server error log and event context", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportServerError({
      error: new Error("controlled failure"),
      requestId: "req-3",
      code: "SESSION_STATE_CONFLICT",
      fallback: "操作失败",
      context: {
        userId: "user-3",
        roomId: "room-3",
        sessionId: "session-3",
        ticketId: "ticket-3",
        action: "goodbye",
        route: "/api/room/30357/goodbye",
        timestamp: "2026-08-23T00:00:01.000Z",
      },
    });

    const record = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      event: "server_error",
      user_id: "user-3",
      room_id: "room-3",
      session_id: "session-3",
      ticket_id: "ticket-3",
      request_id: "req-3",
      action: "goodbye",
      route: "/api/room/30357/goodbye",
      code: "SESSION_STATE_CONFLICT",
      error_name: "Error",
    });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "server_error",
      user_id: "user-3",
      room_id: "room-3",
      session_id: "session-3",
      request_id: "req-3",
      properties: expect.objectContaining({
        ticket_id: "ticket-3",
        action: "goodbye",
        route: "/api/room/30357/goodbye",
      }),
    }));

    consoleError.mockRestore();
    await Promise.resolve();
  });
});
