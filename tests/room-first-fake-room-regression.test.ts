import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

const api = read("src/lib/room-read-model.ts");
const startRpc = read("supabase/migrations/20260826090000_room_resume_eligibility.sql");
const reserveGroupRpc = read("supabase/migrations/20260826090000_room_resume_eligibility.sql");
const groupLifecycle = read("supabase/migrations/20260825193000_matchmaking_v2_minimal_forming.sql");
const exitRoute = read("src/app/api/room/[code]/exit/route.ts");

describe("Room-first fake Room regression contract", () => {
  it("uses one server-side resolveActiveRoom entry point", () => {
    expect(api).toContain("export async function resolveActiveRoom(");
    expect(api).toContain("resolveActiveRoom(profileId, context)");
  });

  it("requires an active current-user member, not just any Room row", () => {
    expect(api).toContain('.eq("user_id", profileId)');
    expect(api).toContain('.eq("status", "active")');
    expect(api).toContain("activeMemberUserId");
  });

  it("requires a current user's live ticket or accepted group membership for pre-Session recovery", () => {
    expect(api).toContain("const liveTickets = (tickets || []).filter");
    expect(api).toContain("const acceptedGroupIds = new Set");
    expect(api).toContain("preSessionEligible");
  });

  it("requires the current user to be in a ready or playing Session", () => {
    expect(api).toContain("sessionPlayersIncludeUser");
    expect(api).toContain('sessionStatus === "ready" || sessionStatus === "playing"');
  });

  it("does not grant resume eligibility from enrichRoom alone", () => {
    expect(api).toContain("resumeEligible: options.resumeEligible === true");
    const enrichRoomSource = api.slice(api.indexOf("export async function enrichRoom"), api.indexOf("type ActiveRoomCandidate"));
    expect(enrichRoomSource).not.toContain("resumeEligible: true,");
  });

  it("does not reuse an orphaned live ticket", () => {
    expect(startRpc).toContain("orphaned_room");
    expect(startRpc).toContain("v_has_valid_backing");
    expect(startRpc).toContain("set state = 'cancelled'");
  });

  it("synchronizes a Casual ticket to the Group Room", () => {
    expect(reserveGroupRpc).toContain("matchmaking_sync_ticket_room_id");
    expect(reserveGroupRpc).toContain("matchmaking_sync_group_ticket_room_ids");
    expect(reserveGroupRpc).toContain("set room_id = new.room_id");
  });

  it("keeps terminal Rooms and terminal Sessions out of recovery", () => {
    expect(api).toContain('const TERMINAL_ROOM_STATUSES = new Set(["completed", "cancelled", "closed", "finished"]);');
    expect(api).toContain('const TERMINAL_SESSION_STATUSES = new Set(["completed", "cancelled"]);');
    expect(api).toContain("terminalSession");
  });

  it("supports pre-Session exit without requiring a Session row", () => {
    expect(exitRoute).toContain("exitPreSessionRoom");
    expect(exitRoute).toContain("if (!currentSession)");
    expect(exitRoute).toContain("room: null");
    expect(exitRoute).not.toContain("await enrichRoom(remainingRoom");
    expect(exitRoute).not.toContain("const current = await sessionForRoomCode(code);");
  });

  it("preserves a forming Room when one Casual member exits", () => {
    expect(groupLifecycle).toContain("if v_remaining = 0 then");
    expect(groupLifecycle).toContain("state = 'backfilling'");
    expect(groupLifecycle).toContain("formation_state = 'backfilling'");
  });
});
