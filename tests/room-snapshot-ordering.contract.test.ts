import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");

describe("Room snapshot ordering", () => {
  it("does not let a delayed authoritative snapshot replace a newer Room version", () => {
    expect(app).toContain("incomingVersion < currentVersion");
    expect(app).toContain("realtimeVersion: incomingVersion");
  });
});
