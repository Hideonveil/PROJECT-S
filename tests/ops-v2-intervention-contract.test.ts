import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 matching interventions", () => {
  it("requires protected preview and action routes without direct Room or Session inserts", () => {
    const paths = ["src/app/api/internal/ops-v2/ranked/preview/route.ts", "src/app/api/internal/ops-v2/ranked/force-match/route.ts", "src/app/api/internal/ops-v2/casual/preview-attach/route.ts", "src/app/api/internal/ops-v2/casual/attach/route.ts"];
    for (const path of paths) expect(existsSync(path)).toBe(true);
    const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
    expect(service).toContain("matchmaking_reserve_pair");
    expect(service).toContain("matchmaking_reserve_group_member");
    expect(service).not.toMatch(/from\("rooms"\)\.insert/);
    expect(service).not.toMatch(/from\("sessions"\)\.insert/);
  });
});
