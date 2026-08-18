import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync("supabase/migrations").find((name) => name.includes("mutual_goodbye_and_friend_requests"));
const sql = migrationName ? readFileSync(`supabase/migrations/${migrationName}`, "utf8") : "";

describe("mutual goodbye and friend request migration", () => {
  it("creates one service-owned goodbye request per session member", () => {
    expect(migrationName).toBeDefined();
    expect(sql).toContain("create table public.session_goodbye_requests");
    expect(sql).toContain("unique (session_id, user_id)");
    expect(sql).toContain("alter table public.session_goodbye_requests enable row level security");
    expect(sql).toContain("alter publication supabase_realtime add table public.session_goodbye_requests");
  });

  it("settles normal play only after all active players request goodbye", () => {
    expect(sql).toContain("function public.phase1_request_goodbye");
    expect(sql).toContain("for update");
    expect(sql).toContain("mutual_goodbye");
    expect(sql).toContain("phase1_complete_session");
  });

  it("makes friend request and response transitions atomic", () => {
    expect(sql).toContain("function public.phase1_request_friendship");
    expect(sql).toContain("function public.phase1_respond_friendship");
    expect(sql).toContain("FRIEND_SELF_FORBIDDEN");
    expect(sql).toContain("FRIEND_DECISION_INVALID");
  });

  it("lets both friendship participants receive request changes without granting browser writes", () => {
    expect(sql).toContain('create policy "friendships_select_participant"');
    expect(sql).toContain("user_id = public.current_profile_id()");
    expect(sql).toContain("friend_id = public.current_profile_id()");
    expect(sql).toContain('drop policy if exists "friendships_insert_own"');
    expect(sql).toContain('drop policy if exists "friendships_update_own"');
    expect(sql).toContain('drop policy if exists "friendships_delete_own"');
  });

  it("starts the room immediately after both candidates confirm", () => {
    expect(sql).toContain("create or replace function public.matchmaking_confirm_pair");
    expect(sql).toContain("values(v_code,v_need,'playing',now())");
    expect(sql).toContain("'playing',now()");
    expect(sql).toContain("state='playing'");
  });

  it("revokes every new RPC from browser roles", () => {
    for (const signature of [
      "public.phase1_request_goodbye(uuid, uuid, boolean, text)",
      "public.phase1_request_friendship(uuid, uuid)",
      "public.phase1_respond_friendship(uuid, uuid, text)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
    }
  });
});
