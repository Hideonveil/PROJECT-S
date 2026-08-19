import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260819193000_feedback_limit.sql", "utf8");
const app = readFileSync("public/js/app.js", "utf8");

describe("registered-player feedback contract", () => {
  it("removes anonymous inserts and limits new reports to 500 characters", () => {
    expect(migration).toContain('drop policy if exists "feedback_insert_anon"');
    expect(migration).toContain("between 10 and 500");
  });

  it("guards the contact window in the client and avoids internal context fields", () => {
    expect(app).toContain("注册或登录后才能联系我们");
    expect(app).toContain('maxlength="500"');
    expect(app).not.toContain('currentPage: location.hash');
    expect(app).not.toContain('currentGame: state.need');
  });
});
