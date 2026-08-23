import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

describe("terminal Session/Room staging matrix", () => {
  it("runs only with an explicitly configured non-production database", () => {
    const output = execFileSync(process.execPath, ["scripts/p0-staging-room-session-matrix.mjs"], {
      encoding: "utf8",
      env: process.env,
    });
    const result = JSON.parse(output);

    expect(["PASS", "UNVERIFIED"]).toContain(result.status);
    if (result.status === "UNVERIFIED") {
      expect(result.reason).toContain("NONPROD_SUPABASE_URL");
    }
  });
});
