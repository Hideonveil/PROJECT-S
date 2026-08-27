import { describe, expect, it } from "vitest";
import { appendOpsAudit } from "./audit";

describe("OPS V2 audit writer", () => {
  it("writes a bounded, structured record through the server client", async () => {
    const inserted: unknown[] = [];
    const client = {
      from(table: string) {
        expect(table).toBe("ops_audit_log");
        return { insert: async (row: unknown) => { inserted.push(row); return { error: null }; } };
      },
    };
    await appendOpsAudit({ operator: "founder", action: "ADMIN_FORCE_RANKED_MATCH", targetUserId: "user-a", reason: "manual rescue", result: { status: "success" } }, client as never);
    expect(inserted).toEqual([{ operator: "founder", action: "ADMIN_FORCE_RANKED_MATCH", target_user_id: "user-a", target_room_id: null, before_state: {}, result: { status: "success" }, reason: "manual rescue" }]);
  });
});
