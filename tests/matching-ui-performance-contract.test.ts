import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("matching UI performance and recruiting polish", () => {
  it("keeps the selectable game and mode artwork visible, small, and warm", () => {
    const index = read("public/index.html");
    const home = read("public/js/pages/home.js");
    const app = read("public/js/app.js");

    [
      "public/assets/games/deadlock-card.jpg",
      "public/assets/games/coming-soon-card.jpg",
      "public/assets/modes/rank-hero-card.jpg",
      "public/assets/modes/casual-hero-card.jpg",
    ].forEach((asset) => expect(existsSync(asset)).toBe(true));

    expect(index).toContain('href="/assets/games/deadlock-card.jpg"');
    expect(index).toContain('href="/assets/games/coming-soon-card.jpg"');
    expect(home).toContain('/assets/games/coming-soon-card.jpg');
    expect(home).toContain('/assets/modes/rank-hero-card.jpg');
    expect(home).toContain('/assets/modes/casual-hero-card.jpg');
    expect(app.indexOf("prewarmMatchArtwork();", app.indexOf('action === "home-game"')))
      .toBeLessThan(app.indexOf("render();", app.indexOf('action === "home-game"')));
  });

  it("serves static artwork with a browser cache lifetime instead of revalidating every route", () => {
    const caddy = read("deploy/china-hk/Caddyfile");
    expect(caddy).toContain("@static_artwork path /assets/*");
    expect(caddy).toContain('header @static_artwork >Cache-Control "public, max-age=604800"');
    expect(caddy).toContain('Cache-Control "public, max-age=604800"');
  });

  it("uses compact voice-style cards for casual intent and keeps More expandable", () => {
    const home = read("public/js/pages/home.js");
    const styles = read("public/styles/product-shell.css");

    expect(home).toContain('match-options--voice match-options--casual-intents');
    expect(home).toContain('data-action="home-toggle-casual-advanced"');
    expect(home).not.toContain("match-casual-intent-card__art");
    expect(styles).toContain(".match-options--casual-intents");
  });

  it("does not repaint a Room for unstable metadata and keeps solo recruitment visually quiet", () => {
    const app = read("public/js/app.js");
    const room = read("public/js/pages/session-preview.js");

    expect(app).toContain("function roomRenderSignature(room)");
    expect(app).toContain("return roomRenderSignature(next) !== roomRenderSignature(prev);");
    expect(room).toContain("const showRecruitmentProgress = recruiting && visiblePlayers.length > 1;");
    expect(room).toContain("showRecruitmentProgress ? icon(\"check\", 15) : \"\"");
    expect(room).toContain("showRecruitmentProgress ? `<div class=\"room-recruitment-indicator\"");
  });
});
