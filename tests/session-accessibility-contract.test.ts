import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Session accessibility and interaction contract", () => {
  const preview = read("public/js/pages/session-preview.js");
  const gameover = read("public/js/pages/gameover.js");
  const styles = read("public/styles/product-shell.css");
  const app = read("public/js/app.js");
  const ui = read("public/js/ui.js");

  it("exposes complete table semantics and keeps the member header free of connectors", () => {
    expect(preview).toContain('role="table"');
    expect(preview).toContain('role="columnheader"');
    expect(preview).toContain('role="rowheader"');
    expect(preview).toContain('role="cell"');
    expect(preview).toContain('withLinks: false');
    expect(preview).toContain('aria-hidden="true"><i class="session-fit-line"');
  });

  it("marks asynchronous room updates and the chat input for assistive technology", () => {
    expect(preview).toContain('role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false"');
    expect(preview).toContain('data-session-live-announcer');
    expect(preview).toContain('data-session-goodbye-status role="status" aria-live="polite" aria-atomic="true"');
    expect(preview).toContain('name="message"');
  });

  it("escapes teammate names in accessible labels and hides decorative icons", () => {
    expect(gameover).toContain('aria-label="${esc(label)}"');
    expect(gameover).toContain('aria-hidden="true"');
  });

  it("guards feedback requests, announces live changes, and focuses new routes", () => {
    expect(app).toContain("roomLikePendingTargets");
    expect(app).toContain("roomRatingPending");
    expect(app).toContain("announceSessionLive");
    expect(app).toContain("focusCurrentRouteHeading");
    expect(ui).toContain('setAttribute("role", "status")');
    expect(ui).toContain('setAttribute("aria-live", "polite")');
  });

  it("restores a visible keyboard focus state for the chat composer", () => {
    expect(styles).toContain(".session-preview-composer input:focus-visible");
  });
});
