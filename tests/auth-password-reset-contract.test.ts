import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authPage = readFileSync("public/js/pages/auth.js", "utf8");
const app = readFileSync("public/js/app.js", "utf8");
const api = readFileSync("public/js/api.js", "utf8");
const route = readFileSync("src/app/api/auth/forgot/route.ts", "utf8");

describe("password recovery flow", () => {
  it("exposes request, recovery, and new-password screens", () => {
    expect(authPage).toContain('data-action="forgot-password"');
    expect(authPage).toContain('data-form="auth-forgot"');
    expect(authPage).toContain('data-form="auth-reset"');
    expect(app).toContain("submitForgotPassword");
    expect(app).toContain("submitPasswordReset");
  });

  it("uses a rate-limited server endpoint and Supabase recovery session", () => {
    expect(existsSync("src/app/api/auth/forgot/route.ts")).toBe(true);
    expect(route).toContain("takeRateLimit");
    expect(route).toContain("resetPasswordForEmail");
    expect(api).toContain("/api/auth/forgot");
    expect(api).toContain("auth.updateUser({ password })");
  });
});
