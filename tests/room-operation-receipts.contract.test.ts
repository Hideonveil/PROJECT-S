import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260829163000_room_operation_receipts.sql";

describe("Room operation receipt contract", () => {
  it("stores and reuses one atomic result for each actor operation id", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create table if not exists public.room_operation_receipts");
    expect(sql).toContain("primary key (actor_id, operation_id)");
    expect(sql).toContain("create or replace function public.execute_room_operation");
    expect(sql).toContain("OPERATION_ID_REUSED");
    expect(sql).toContain("'reused', true");
    expect(sql).toContain("insert into public.room_operation_receipts");
    expect(sql).toContain("grant execute on function public.execute_room_operation");
  });

  it("routes every formal Room mutation through the receipt function", () => {
    for (const route of ["goodbye", "recruitment", "slip", "exit"]) {
      const source = readFileSync(`src/app/api/room/[code]/${route}/route.ts`, "utf8");
      expect(source).toContain('.rpc("execute_room_operation"');
    }
  });
});
