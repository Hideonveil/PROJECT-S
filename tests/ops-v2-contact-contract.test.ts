import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 Contact Us contract", () => {
  it("adds an operator-only workflow status instead of repurposing email status", () => {
    const migrationPath = "supabase/migrations/20260827102000_ops_v2_contact_status.sql";
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ops_status");
    expect(migration).toContain("unread");
    expect(migration).toContain("resolved");
  });
});
