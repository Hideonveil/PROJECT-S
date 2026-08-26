import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");
const home = readFileSync("public/js/pages/home.js", "utf8");
const room = readFileSync("public/js/pages/session-preview.js", "utf8");
const migration = readFileSync("supabase/migrations/20260825230000_room_first_matchmaking.sql", "utf8");

describe("room-first matching UI", () => {
  it("does not imply ranked steps before a goal is selected", () => {
    expect(app).toContain('if (!HOME_FILTER.goal) return ["goal"]');
    expect(home).toContain('filter.goal ? DEADLOCK_PATHS');
  });

  it("re-renders the wizard body after selecting a goal", () => {
    const start = app.indexOf('if (action === "home-goal")');
    const end = app.indexOf('if (action === "home-casual-intent")', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(app.slice(start, end)).toContain("render();");
  });

  it("updates casual intent locally instead of rebuilding the page", () => {
    expect(app).toContain("function updateCasualIntentView()");
    expect(app).toContain("setCasualAdvancedOpen(Boolean(HOME_FILTER.advancedOpen))");
  });

  it("keeps the selected casual recruitment intent all the way to the API contract", () => {
    expect(app).toContain('recruitmentMode: DRAFT.goal === "娱乐"');
    expect(migration).toContain("v_ticket.metadata->>'recruitmentMode'");
  });

  it("routes legacy matching links to the single Room surface", () => {
    expect(app).toContain('case "matching":');
    expect(app).toContain('replaceCanonicalRoute(isActiveSessionRoom(state.room) ? "#/room" : "#/home")');
    expect(room).toContain("room-recruitment-indicator");
  });

  it("creates a Room before matching and reuses it for ranked pairs", () => {
    expect(migration).toContain("matchmaking_create_waiting_room");
    expect(migration).toContain("room_id uuid null references public.rooms");
    expect(migration).toContain("room_first_pair_reserved");
  });
});
