import { describe, expect, it } from "vitest";
import { isEffectivelyOnline, presenceCutoffIso } from "./presence";

describe("effective presence", () => {
  const now = Date.parse("2026-08-23T00:00:00.000Z");

  it("accepts a recent online heartbeat", () => {
    expect(isEffectivelyOnline({ online: true, last_seen: "2026-08-22T23:59:45.000Z" }, now)).toBe(true);
  });

  it("expires stale online booleans", () => {
    expect(isEffectivelyOnline({ online: true, last_seen: "2026-08-22T23:59:29.000Z" }, now)).toBe(false);
    expect(isEffectivelyOnline({ online: true, last_seen: null }, now)).toBe(false);
    expect(isEffectivelyOnline({ online: false, last_seen: "2026-08-22T23:59:59.000Z" }, now)).toBe(false);
  });

  it("uses the same 30-second cutoff for database filters", () => {
    expect(presenceCutoffIso(now)).toBe("2026-08-22T23:59:30.000Z");
  });
});
