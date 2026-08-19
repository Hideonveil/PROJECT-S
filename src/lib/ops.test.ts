import { afterEach, describe, expect, it } from "vitest";
import { OPS_COOKIE_NAME, isOpsPasswordValid, isOpsRequestAuthorized, opsSessionValue } from "./ops";

const originalToken = process.env.OPS_TOKEN;
const originalPassword = process.env.OPS_PASSWORD;

afterEach(() => {
  process.env.OPS_TOKEN = originalToken;
  process.env.OPS_PASSWORD = originalPassword;
});

describe("operations authentication", () => {
  it("accepts the private password and creates a derived session", () => {
    process.env.OPS_TOKEN = "server-token-for-test";
    process.env.OPS_PASSWORD = "human-password";
    expect(isOpsPasswordValid("human-password")).toBe(true);
    expect(isOpsPasswordValid("server-token-for-test")).toBe(false);
    expect(opsSessionValue()).not.toContain("server-token-for-test");
  });

  it("accepts either the service bearer token or signed http-only session cookie", () => {
    process.env.OPS_TOKEN = "server-token-for-test";
    const bearer = new Request("https://jiyuan.online/api/ops/metrics", {
      headers: { authorization: "Bearer server-token-for-test" },
    });
    const cookie = new Request("https://jiyuan.online/api/ops/metrics", {
      headers: { cookie: `${OPS_COOKIE_NAME}=${opsSessionValue()}` },
    });
    expect(isOpsRequestAuthorized(bearer)).toBe(true);
    expect(isOpsRequestAuthorized(cookie)).toBe(true);
  });
});
