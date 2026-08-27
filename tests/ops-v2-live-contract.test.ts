import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 live route contract", () => {
  it("exposes a protected live snapshot backed by current Room-first tables", () => {
    const path = "src/app/api/internal/ops-v2/live/route.ts";
    expect(existsSync(path)).toBe(true);
    const route = readFileSync(path, "utf8");
    expect(route).toContain("requireOpsV2Authorization");
    expect(route).toContain("resolveLiveOpsSnapshot");
  });
});
