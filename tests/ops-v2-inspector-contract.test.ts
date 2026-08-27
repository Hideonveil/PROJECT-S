import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 inspector routes", () => {
  it("keeps user and room inspection behind protected server resolvers", () => {
    const routes = ["src/app/api/internal/ops-v2/users/route.ts", "src/app/api/internal/ops-v2/users/[userId]/route.ts", "src/app/api/internal/ops-v2/rooms/route.ts"];
    for (const path of routes) {
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("requireOpsV2Authorization");
    }
  });
});
