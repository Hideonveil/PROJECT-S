import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("private Appsmith deployment", () => {
  it("binds Appsmith to loopback and keeps production credentials out of the template", () => {
    const composePath = "deploy/ops-v2/compose.yaml";
    const envPath = "deploy/ops-v2/.env.example";
    expect(existsSync(composePath)).toBe(true);
    expect(existsSync(envPath)).toBe(true);
    const compose = readFileSync(composePath, "utf8");
    const env = readFileSync(envPath, "utf8");
    expect(compose).toContain("127.0.0.1:8081:80");
    expect(compose).toContain("appsmith/appsmith-ce:release");
    expect(env).toContain("OPS_V2_API_KEY=");
    expect(env).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });
});
