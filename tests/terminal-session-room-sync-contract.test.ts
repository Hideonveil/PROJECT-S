import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822210000_sync_room_with_terminal_session.sql",
  "utf8",
);

function functionSection(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate or replace function public.", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("terminal Session -> Room synchronization migration", () => {
  it("is a forward-only, non-backfill migration", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration.match(/update\s+public\.rooms/gi)).toHaveLength(1);
  });

  it("closes a non-terminal Room for both terminal Session states", () => {
    const lifecycle = functionSection("matchmaking_sync_session_lifecycle");

    expect(lifecycle).toContain("when 'completed' then 'completed'");
    expect(lifecycle).toContain("when 'cancelled' then 'cancelled'");
    expect(lifecycle).toContain("if v_target in ('completed', 'cancelled') then");
    expect(lifecycle).toContain("status in ('connecting', 'ready', 'playing')");
    expect(lifecycle).toContain(
      "completed_at = coalesce(completed_at, new.ended_at, now())",
    );
  });

  it("makes the lifecycle trigger the only Room terminal-state writer", () => {
    expect(functionSection("phase1_exit_room")).not.toContain("update public.rooms");
    expect(functionSection("phase1_finalize_session")).not.toContain("update public.rooms");
    expect(migration).toContain("after update of status");
    expect(migration).toContain("on public.sessions");
    expect(migration).not.toMatch(/create\s+(?:constraint\s+)?trigger[^;]+on public\.rooms/i);
  });

  it("is idempotent and keeps internal permissions restricted", () => {
    expect(migration).toContain("drop trigger if exists matchmaking_session_lifecycle_trigger");
    expect(migration).toContain("revoke all on function public.matchmaking_sync_session_lifecycle()");
    expect(migration).toContain("grant execute on function public.matchmaking_sync_session_lifecycle()");
    expect(migration).toContain("revoke all on function public.phase1_exit_room(uuid, uuid, text)");
    expect(migration).toContain("grant execute on function public.phase1_exit_room(uuid, uuid, text)");
  });

  it("preserves normal completion side effects while centralizing Room state", () => {
    const finalizer = functionSection("phase1_finalize_session");

    expect(finalizer).toContain("status = 'completed'");
    expect(finalizer).toContain("recent_connections");
    expect(finalizer).toContain("session_completed");
    expect(finalizer).not.toContain("update public.rooms");
  });

  it("does not introduce a Session/Room trigger cycle", () => {
    expect(migration).not.toMatch(/create\s+(?:constraint\s+)?trigger[^;]+on\s+public\.rooms/i);
    expect(functionSection("matchmaking_sync_session_lifecycle")).not.toContain(
      "update public.sessions",
    );
  });
});
