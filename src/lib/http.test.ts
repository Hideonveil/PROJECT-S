import { describe, expect, it, vi } from "vitest";

vi.mock("./metrics", () => ({ reportServerError: vi.fn() }));

import { errorResponse } from "./http";
import { reportServerError } from "./metrics";

describe("errorResponse", () => {
  it("maps Supabase-style error objects to their domain status", async () => {
    const response = errorResponse({ message: "GROUP_FORBIDDEN", code: "42501" }, "req-1", "无法以当前人数开始");
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "GROUP_FORBIDDEN", retryable: false, requestId: "req-1" });
  });

  it("forwards server error business context", async () => {
    const response = errorResponse(
      new Error("database unavailable"),
      "req-2",
      "操作失败",
      {
        userId: "user-1",
        roomId: "room-1",
        sessionId: "session-1",
        action: "goodbye",
        route: "/api/room/30357/goodbye",
      }
    );
    await response.json();

    expect(vi.mocked(reportServerError)).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-2",
        context: expect.objectContaining({
          userId: "user-1",
          roomId: "room-1",
          sessionId: "session-1",
          action: "goodbye",
          route: "/api/room/30357/goodbye",
        }),
      })
    );
  });
});
