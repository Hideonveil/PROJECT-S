import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("OPS V2 matching interventions", () => {
  it("requires protected preview and action routes without direct Room or Session inserts", () => {
    const paths = ["src/app/api/internal/ops-v2/ranked/preview/route.ts", "src/app/api/internal/ops-v2/ranked/force-match/route.ts", "src/app/api/internal/ops-v2/casual/preview-attach/route.ts", "src/app/api/internal/ops-v2/casual/attach/route.ts"];
    for (const path of paths) expect(existsSync(path)).toBe(true);
    const matchingSources = readdirSync("src/lib/matchmaking", { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
      .map((entry) => readFileSync(join("src/lib/matchmaking", entry.name), "utf8"))
      .join("\n");
    expect(matchingSources).toContain("matchmaking_reserve_pair");
    expect(matchingSources).toContain('select("room_id")');
    expect(matchingSources).toContain("matchmaking_reserve_group_member");
    expect(matchingSources).not.toMatch(/from\("rooms"\)\.insert/);
    expect(matchingSources).not.toMatch(/from\("sessions"\)\.insert/);
  });

  it("provides audited lifecycle-safe casual locking and contact status changes", () => {
    const paths = [
      "src/app/api/internal/ops-v2/casual/lock/route.ts",
      "src/app/api/internal/ops-v2/contacts/[contactId]/route.ts",
    ];
    for (const path of paths) expect(existsSync(path)).toBe(true);

    const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
    const casual = readFileSync("src/lib/matchmaking/casual.ts", "utf8");
    const interventions = readFileSync("src/lib/ops-v2/interventions.ts", "utf8");
    const contacts = readFileSync("src/app/api/internal/ops-v2/contacts/[contactId]/route.ts", "utf8");
    expect(casual).toContain("matchmaking_lock_forming_group");
    expect(interventions).toContain("ADMIN_LOCK_CASUAL_ROOM");
    expect(contacts).toContain("CONTACT_STATUS_UPDATED");
    expect(service).not.toMatch(/from\("rooms"\)\.update/);
    expect(service).not.toMatch(/from\("sessions"\)\.update/);
    expect(casual).not.toMatch(/from\("rooms"\)\.update/);
    expect(casual).not.toMatch(/from\("sessions"\)\.update/);
  });
});
