import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Session fit connector contract", () => {
  it("renders connector lines as independent elements in the grid", () => {
    const preview = read("public/js/pages/session-preview.js");
    const styles = read("public/styles/product-shell.css");
    expect(preview).toContain("session-fit-line");
    expect(preview).toContain("session-fit-member");
    expect(preview).toContain("fitGridStyle(memberCount)");
    expect(preview).toContain("minmax(0, max-content)");
    expect(styles).toContain(".session-fit-line");
    expect(styles).toContain("text-align: center");
    expect(styles).toContain("justify-self: stretch");
    expect(styles).toContain("inset-inline: 12px");
    expect(styles).not.toContain(".session-fit-row--group .session-fit-conditions .session-fit-member { text-align: left; }");
    expect(styles).not.toMatch(/\.session-fit-link(?:\.is-match)?::(?:before|after)/);
    expect(styles).not.toContain(".session-fit-link.is-match::before");
    expect(styles).not.toContain(".session-fit-link.is-match::after");
  });

  it("keeps casual members dynamic instead of hardcoding two players", () => {
    const preview = read("public/js/pages/session-preview.js");
    expect(preview).toContain("model.players.length");
    expect(preview).toContain("groupFitCells(model.players");
    expect(preview).toContain("members.length");
  });
});
