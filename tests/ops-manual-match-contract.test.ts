import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("operations manual matching contract", () => {
  it("exposes a protected candidate endpoint", () => {
    const route = read("src/app/api/ops/manual-match/route.ts");
    expect(existsSync("src/app/api/ops/manual-match/route.ts")).toBe(true);
    expect(route).toContain("isOpsRequestAuthorized");
    expect(route).toContain('eq("state", "searching")');
    expect(route).toContain("evaluateCompatibility");
  });

  it("requires both users to remain in the pool and leaves confirmation to users", () => {
    const route = read("src/app/api/ops/manual-match/route.ts");
    const page = read("src/app/ops/page.tsx");
    expect(route).toContain("OPS_MANUAL_MATCH_UNAVAILABLE");
    expect(route).toContain('pair.reason === "MATCH_RESERVATION_CONFLICT"');
    expect(route).toContain('status: "waiting_confirmation"');
    expect(route).not.toContain("matchmaking_confirm_pair");
    expect(page).toContain("双方仍需在自己的页面确认");
    expect(page).toContain("人工匹配界面");
  });
});
