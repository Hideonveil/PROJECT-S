import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("hero activity privacy and rotation contract", () => {
  it("does not render live totals on the Hero", () => {
    const landing = read("public/js/pages/landing.js");
    expect(landing).not.toContain("hero-matching-count");
    expect(landing).not.toContain("hero-online-count");
    expect(landing).toContain("此刻的“机”缘");
    expect(landing).not.toContain("正在找队友");
    expect(landing).not.toContain("自动轮换");
  });

  it("cycles through a larger privacy-safe directory window", () => {
    const app = read("public/js/app.js");
    const api = read("src/lib/api.ts");
    expect(app).toContain("heroDirectoryOffset");
    expect(app).toContain("setInterval(rotateHeroDirectory, 2000)");
    expect(app).toContain("setInterval(refreshHeroActivity, 10_000)");
    expect(app).toContain("setInterval(refreshHeroDirectory, 10_000)");
    expect(app).toContain("heroActivityRequestPending");
    expect(app).toContain("heroDirectoryRequestPending");
    expect(app).toContain("heroDirectorySignature");
    expect(app).toContain("presenceHeartbeatHandle");
    expect(app).toContain("window.setInterval(beat, 10_000)");
    expect(app).toContain('document.visibilityState !== "visible"');
    expect(app).toContain("HERO_PREVIEW_DIRECTORY");
    expect(app).toContain("api.poolSummary()");
    expect(app).toContain("api.publicDirectory()");
    expect(api).toContain("export async function publicDirectory");
    expect(api).toMatch(/publicMatchDirectory\(18\b/);
    expect(api).toContain("Math.min(18");
  });
});
