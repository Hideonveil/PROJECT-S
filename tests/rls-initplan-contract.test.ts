import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825110000_optimize_rls_initplan.sql",
  "utf8",
);

describe("RLS initplan optimization contract", () => {
  it("changes exactly the four approved policies", () => {
    expect(migration.match(/drop policy if exists/g)).toHaveLength(4);
    expect(migration).toContain('"profiles_insert_own" on public.profiles');
    expect(migration).toContain('"profiles_update_own" on public.profiles');
    expect(migration).toContain('"profiles_select_own" on public.profiles');
    expect(migration).toContain('"sessions_select_participant" on public.sessions');
  });

  it("keeps authenticated roles and policy commands unchanged", () => {
    expect(migration).toMatch(/profiles_insert_own[\s\S]*for insert to authenticated/);
    expect(migration).toMatch(/profiles_update_own[\s\S]*for update to authenticated/);
    expect(migration).toMatch(/profiles_select_own[\s\S]*for select to authenticated/);
    expect(migration).toMatch(/sessions_select_participant[\s\S]*for select to authenticated/);
  });

  it("uses statement-stable auth.uid initplans and no auth.jwt path", () => {
    expect(migration.match(/\(select auth\.uid\(\)\)/g)).toHaveLength(5);
    expect(migration).not.toContain("auth.jwt()");
    const executableSql = migration.replace(/--.*$/gm, "");
    expect(executableSql.match(/auth\.uid\(\)/g)).toHaveLength(5);
  });

  it("preserves profile identity isolation for insert, update, and select", () => {
    expect(migration).toContain("with check (auth_user_id = (select auth.uid()))");
    expect(migration).toContain("using (auth_user_id = (select auth.uid()))");
    expect(migration).toContain(
      "using (auth_user_id = (select auth.uid()))\n  with check (auth_user_id = (select auth.uid()))",
    );
  });

  it("preserves participant-only session visibility", () => {
    expect(migration).toContain("jsonb_array_elements_text(public.sessions.players)");
    expect(migration).toContain("from public.profiles");
    expect(migration).toContain("where auth_user_id = (select auth.uid())");
    expect(migration).toContain("limit 1");
  });

  it("does not broaden policies with permissive predicates or public roles", () => {
    expect(migration).not.toContain("using (true)");
    expect(migration).not.toMatch(/to (public|anon)(?:\s|$)/);
    expect(migration).not.toContain("drop policy if exists \"profiles_select\"");
  });
});
