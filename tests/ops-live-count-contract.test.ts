import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OPS live counts", () => {
  it("counts playing members from active Sessions rather than retained room shells", () => {
    const api = readFileSync("src/lib/api.ts", "utf8");
    expect(api).toContain('.from("sessions").select("room_id").eq("status", "playing")');
    expect(api).not.toContain('.from("rooms").select("id").eq("status", "playing")');
  });

  it("refreshes the dashboard silently every 30 seconds", () => {
    const page = readFileSync("src/app/ops/page.tsx", "utf8");
    expect(page).toContain("window.setInterval");
    expect(page).toContain("30_000");
    expect(page).toContain("load(days, true)");
    expect(page).toContain('document.addEventListener("visibilitychange"');
    expect(page).toContain("recentFeedback");
  });
});
