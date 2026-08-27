import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 audit migration contract", () => {
  it("creates an append-only audit table inaccessible to public database roles", () => {
    const path = "supabase/migrations/20260827100000_ops_v2_audit.sql";
    expect(existsSync(path)).toBe(true);
    const migration = readFileSync(path, "utf8");
    expect(migration).toContain("create table if not exists public.ops_audit_log");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.ops_audit_log from public, anon, authenticated");
    expect(migration).toContain("grant select, insert on table public.ops_audit_log to service_role");
  });
});
