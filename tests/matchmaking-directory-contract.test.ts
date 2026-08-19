import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync("src/lib/matchmaking/service.ts", "utf8");
const home = readFileSync("public/js/pages/home.js", "utf8");

describe("matchmaking directory contract", () => {
  it("publishes only a small, active Deadlock waiting-pool preview", () => {
    expect(service).toContain("const directoryTickets");
    expect(service).toContain(".eq(\"game_id\", \"deadlock\")");
    expect(service).toContain(".eq(\"state\", \"searching\")");
    expect(service).toContain("nickname: directoryProfileById");
    expect(service).not.toContain("friendCode: directory");
    expect(service).not.toContain("gameAccounts: directory");
  });

  it("keeps the lobby preview inside the match page and hides pool counts", () => {
    expect(home).toContain('class="match-directory"');
    expect(home).toContain("OTHER GAMES");
    expect(home).not.toContain("匹配池在线");
  });
});
