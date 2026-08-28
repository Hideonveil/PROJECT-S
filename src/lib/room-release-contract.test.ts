import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/20260828180000_room_lifecycle_v2.sql");

describe("Room lifecycle V2 release contract", () => {
  it("ships one forward-only migration with votes, settlement and monotonic room events", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("room_recruitment_votes");
    expect(sql).toContain("session_participant_settlements");
    expect(sql).toContain("room_state_events");
    expect(sql).toContain("room_membership_version");
    expect(sql).toContain("toggle_room_recruitment_vote");
    expect(sql).toContain("settle_session_participant");
  });

  it("does not use active room membership as the goodbye denominator", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const goodbyeStart = sql.indexOf("create or replace function public.phase1_request_goodbye");
    expect(goodbyeStart).toBeGreaterThan(-1);
    const goodbyeSql = sql.slice(goodbyeStart);
    expect(goodbyeSql).toContain("jsonb_array_elements_text(v_session.players)");
    expect(goodbyeSql).not.toContain("v_active_count > 1");
  });

  it("bumps Room authority for chat, goodbye, votes and membership changes", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const table of ["messages", "session_goodbye_requests", "room_recruitment_votes", "room_members"]) {
      expect(sql).toContain(`${table}_bump_room_version`);
    }
  });

  it("enforces one active client and preserves the 180-second timeout as participant settlement", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("profile_active_clients");
    expect(sql).toContain("revoke all on function public.append_room_state_event");
    expect(sql).toContain("grant select on table public.room_recruitment_votes to authenticated, service_role");
    expect(sql).toContain("create or replace function public.phase1_timeout_leave");
    expect(sql).toContain("'disconnect_timeout'");
    expect(sql).not.toContain("completion_reason = 'system_timeout_leave'");
  });

  it("does not use a Casual owner as the stop-recruitment authority", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const start = sql.indexOf("create or replace function public.toggle_room_recruitment_vote");
    const end = sql.indexOf("create or replace function public.settle_session_participant");
    const voteSql = sql.slice(start, end);
    expect(voteSql).toContain("v_votes = v_total");
    expect(voteSql).not.toContain("owner_user_id");
  });
});
