import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Session fit connector contract", () => {
  it("renders connector lines as independent elements in the grid", () => {
    const preview = read("public/js/pages/session-preview.js");
    const styles = read("public/styles/product-shell.css");
    expect(preview).toContain("session-fit-line");
    expect(preview).toContain("fitGridStyle(members.length)");
    expect(styles).toContain(".session-fit-line");
    expect(styles).not.toContain(".session-fit-link::before");
  });

  it("keeps casual members dynamic instead of hardcoding two players", () => {
    const preview = read("public/js/pages/session-preview.js");
    expect(preview).toContain("model.players.length");
    expect(preview).toContain("groupFitCells(model.players");
    expect(preview).toContain("members.length");
  });
});
