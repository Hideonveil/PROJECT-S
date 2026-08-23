import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("bilingual site contract", () => {
  it("loads the shared translator before the SPA module", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    expect(html).toContain('src="js/i18n.js');
    expect(html.indexOf('src="js/i18n.js')).toBeLessThan(html.indexOf('src="js/app.js'));
  });

  it("preserves all caution-line variants", () => {
    const source = fs.readFileSync(path.join(root, "public/js/i18n.js"), "utf8");
    expect(source).toContain('"[data-product-ticker]"');
    expect(source).toContain('".project-transition-tape"');
    expect(source).toContain('".pc-only-warning"');
    expect(source).toContain('".connection-tape"');
    expect(source).toContain('".player-profile-tape"');
    expect(source).toContain('".auth-warning-rule"');
  });

  it("supports IP lookup, browser fallback, and manual override", () => {
    const route = fs.readFileSync(path.join(root, "src/app/api/locale/route.ts"), "utf8");
    const source = fs.readFileSync(path.join(root, "public/js/i18n.js"), "utf8");
    expect(route).toContain('request.headers.get("x-forwarded-for")');
    expect(route).toContain("https://api.country.is/");
    expect(route).toContain("AbortSignal.timeout(1500)");
    expect(route).toContain("isPublicIp(ip)");
    expect(source).toContain('localStorage.getItem(MANUAL_KEY)');
    expect(source).toContain('control.dataset.localeSwitch');
  });

  it("does not recursively mutate the locale switch from its own observer", () => {
    const source = fs.readFileSync(path.join(root, "public/js/i18n.js"), "utf8");
    expect(source).toContain('if (control.textContent !== label) control.textContent = label');
    expect(source).toContain('if (control.getAttribute("aria-label") !== ariaLabel)');
  });
});
