import { afterEach, describe, expect, it } from "vitest";
import { deriveOpsPassword, isOpsRequestAuthorized, opsSessionValue, verifyDerivedOpsPassword } from "./ops";

const originalToken = process.env.OPS_TOKEN;

afterEach(() => {
  process.env.OPS_TOKEN = originalToken;
});

describe("operations authentication", () => {
  it("stores a one-way password derivation and compares it safely", () => {
    process.env.OPS_TOKEN = "server-token-for-test";
    const hash = deriveOpsPassword("human-password", "stable-test-salt");
    expect(hash).not.toContain("human-password");
    expect(verifyDerivedOpsPassword("human-password", "stable-test-salt", hash)).toBe(true);
    expect(verifyDerivedOpsPassword("wrong-password", "stable-test-salt", hash)).toBe(false);
    expect(opsSessionValue(4)).not.toContain("server-token-for-test");
    expect(opsSessionValue(4)).not.toBe(opsSessionValue(5));
  });

  it("accepts the private service bearer token", async () => {
    process.env.OPS_TOKEN = "server-token-for-test";
    const bearer = new Request("https://jiyuan.online/api/ops/metrics", {
      headers: { authorization: "Bearer server-token-for-test" },
    });
    expect(await isOpsRequestAuthorized(bearer)).toBe(true);
  });
});
