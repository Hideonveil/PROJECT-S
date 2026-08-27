import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS V2 matching interventions", () => {
  it("requires protected preview and action routes without direct Room or Session inserts", () => {
    const paths = ["src/app/api/internal/ops-v2/ranked/preview/route.ts", "src/app/api/internal/ops-v2/ranked/force-match/route.ts", "src/app/api/internal/ops-v2/casual/preview-attach/route.ts", "src/app/api/internal/ops-v2/casual/attach/route.ts"];
    for (const path of paths) expect(existsSync(path)).toBe(true);
    const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
    expect(service).toContain("matchmaking_reserve_pair");
    expect(service).toContain('select("room_id")');
    expect(service).toContain("matchmaking_reserve_group_member");
    expect(service).not.toMatch(/from\("rooms"\)\.insert/);
    expect(service).not.toMatch(/from\("sessions"\)\.insert/);
  });

  it("provides audited lifecycle-safe casual locking and contact status changes", () => {
    const paths = [
      "src/app/api/internal/ops-v2/casual/lock/route.ts",
      "src/app/api/internal/ops-v2/contacts/[contactId]/route.ts",
    ];
    for (const path of paths) expect(existsSync(path)).toBe(true);

    const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
    const interventions = readFileSync("src/lib/ops-v2/interventions.ts", "utf8");
    const contacts = readFileSync("src/app/api/internal/ops-v2/contacts/[contactId]/route.ts", "utf8");
    expect(service).toContain("matchmaking_lock_forming_group");
    expect(interventions).toContain("ADMIN_LOCK_CASUAL_ROOM");
    expect(contacts).toContain("CONTACT_STATUS_UPDATED");
    expect(service).not.toMatch(/from\("rooms"\)\.update/);
    expect(service).not.toMatch(/from\("sessions"\)\.update/);
  });
});
