import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const api = readFileSync("public/js/api.js", "utf8");
const app = readFileSync("public/js/app.js", "utf8");

describe("single password sign-in contract", () => {
  it("returns the session created by the server login request", () => {
    expect(route).toContain("session: {");
    expect(route).toContain("access_token: data.session.access_token");
    expect(route).toContain("refresh_token: data.session.refresh_token");
  });

  it("hydrates the browser session without a second password sign-in", () => {
    expect(api).toContain("sb.auth.setSession");
    expect(app).toContain("api.setSession(data.session)");
    expect(app).not.toContain("api.signIn(data.email, password)");
  });
});
