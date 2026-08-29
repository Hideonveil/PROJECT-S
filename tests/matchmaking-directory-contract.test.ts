import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const status = readFileSync("src/lib/matchmaking/status.ts", "utf8");
const home = readFileSync("public/js/pages/home.js", "utf8");

describe("matchmaking directory contract", () => {
  // Architecture ratchet: query projection/privacy cannot be observed through
  // the browser mock. The visible directory behavior is paired with the E2E
  // lobby-preview coverage in mvp-closure.spec.ts.
  it("publishes only a small, active waiting-pool preview", () => {
    expect(status).toContain("const directoryTickets");
    expect(status).toContain(".eq(\"state\", \"searching\")");
    expect(status).toContain("nickname: directoryProfileById");
    expect(status).not.toContain("friendCode: directory");
    expect(status).not.toContain("gameAccounts: directory");
  });

  it("keeps the lobby preview inside the match page and hides pool counts", () => {
    expect(home).toContain('class="match-directory match-directory--signal-card"');
    expect(home).toContain("OTHER GAMES");
    expect(home).not.toContain("匹配池在线");
  });
});
