import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260821120000_harden_matchmaking_permissions_and_group_lifecycle.sql",
  "utf8",
);

describe("matchmaking hardening migration", () => {
  it.each([
    "matchmaking_ensure_group(uuid)",
    "matchmaking_reserve_group_member(uuid, uuid, jsonb, jsonb)",
    "matchmaking_start_group(uuid, uuid, text)",
    "matchmaking_confirm_group(uuid, uuid, text, text)",
    "matchmaking_cancel_group(uuid, text, text)",
    "matchmaking_expire_group_stale()",
  ])("keeps %s server-only", (signature) => {
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
  });

  it("starts fully-confirmed casual groups through the canonical session transition", () => {
    expect(sql).toContain("create or replace function public.matchmaking_start_group_session()");
    expect(sql).toContain("perform public.phase1_start_session(new.session_id, new.owner_user_id, null)");
    expect(sql).toContain("create constraint trigger matchmaking_group_session_start_trigger");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("set state = 'playing'");
    expect(sql).toContain("set state = 'playing', playing_at = coalesce(playing_at, now())");
  });

  it("removes broad legacy reads and direct application rewrites", () => {
    expect(sql).toContain('create policy "user_games_select_own"');
    expect(sql).toContain("using (user_id = public.current_profile_id())");
    expect(sql).toContain('create policy "match_requests_select_own"');
    expect(sql).toContain('drop policy if exists "applications_update_involved"');
    expect(sql).not.toContain("create policy \"applications_update_involved\"");
  });

  it("indexes the presence TTL filter", () => {
    expect(sql).toContain("create index if not exists profiles_online_last_seen_idx");
    expect(sql).toContain("on public.profiles (online, last_seen)");
  });
});
