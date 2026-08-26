import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/js/app.js", "utf8");
const home = readFileSync("public/js/pages/home.js", "utf8");
const room = readFileSync("public/js/pages/session-preview.js", "utf8");
const styles = readFileSync("public/styles/product-shell.css", "utf8");
const migration = readFileSync("supabase/migrations/20260825230000_room_first_matchmaking.sql", "utf8");

describe("room-first matching UI", () => {
  it("does not imply ranked steps before a goal is selected", () => {
    expect(app).toContain('if (!HOME_FILTER.goal) return ["goal"]');
    expect(home).toContain('filter.goal ? DEADLOCK_PATHS');
  });

  it("switches goals in place after the initial game selection", () => {
    const start = app.indexOf('if (action === "home-goal")');
    const end = app.indexOf('if (action === "home-casual-intent")', start);
    const branch = app.slice(start, end);
    expect(branch).toContain("selectHomeChoice(actionEl)");
    expect(branch).toContain("updateHomeFlowStepper()");
    expect(branch).not.toContain("render();");
  });

  it("defaults Deadlock to Ranked without changing goal toggles into a reload", () => {
    const start = app.indexOf('if (action === "home-game")');
    const end = app.indexOf('if (action === "home-back-games")', start);
    const branch = app.slice(start, end);
    expect(branch).toContain('HOME_FILTER.goal = "rank"');
    expect(branch).toContain("prewarmMatchArtwork();");
    expect(branch).toContain("render();");
  });

  it("does not repaint the home wizard for realtime activity snapshots", () => {
    const start = app.indexOf("function connectEvents()");
    const end = app.indexOf("function markPresenceOnline", start);
    const branch = app.slice(start, end);
    expect(app).toContain("function updateHomeActivityView(");
    expect(branch).toContain("updateHomeActivityView(state.match)");
    expect(branch).not.toContain("if (routeName === \"home\") {\n        render();");
    expect(app).toContain('if (routeName === "home" && Array.isArray(data.matchmaking?.directory)) updateHomeDirectoryView(state.match);');
  });

  it("invalidates an in-place stepper animation before a full route render", () => {
    const start = app.indexOf("function clearTimers()");
    const end = app.indexOf("function initProductTicker", start);
    expect(app).toContain("homeStepperRevision += 1;");
    expect(app.slice(start, end)).toContain("homeStepperRevision += 1;");
  });

  it("resyncs the stepper accessibility label after a full render", () => {
    expect(app).toContain("function syncHomeStepperAccessibility()");
    expect(app).toContain("syncHomeStepperAccessibility();");
  });

  it("keeps the final start CTA wide enough to show its label", () => {
    expect(styles).toContain(".match-wizard-actions > [data-home-wizard-advance]");
    expect(styles).toContain(".match-wizard-actions .match-start-dock { width: 100%;");
  });

  it("keeps the final start CTA in document flow instead of hiding it as a floating icon", () => {
    const home = app.slice(app.indexOf('if (route.name === "home") {'), app.indexOf('if (route.name === "matching") {'));
    expect(home).not.toContain("initMatchStartDock();");
    expect(styles).toContain(".match-wizard-actions .match-start-dock { width: 100%;");
    expect(styles).not.toContain(".match-wizard-actions .match-start-dock { width: 58%; }");
  });

  it("reconciles a successful Room-first start before showing pool-entry failure", () => {
    const start = app.indexOf("async function startMatch()");
    const end = app.indexOf("function startMatchingFlow", start);
    const branch = app.slice(start, end);
    expect(branch).toContain("reconcileRoomFirstStart");
    expect(branch).not.toContain('throw new Error("ROOM_FIRST_NOT_READY")');
  });

  it("does not show progress or start matching before a goal is chosen", () => {
    const start = home.indexOf("function deadlockStage");
    const end = home.indexOf("function rolesLabel", start);
    const stage = home.slice(start, end);
    expect(stage).toContain("const progress = filter.goal");
    expect(stage).toContain("data-home-stepper hidden");
    expect(stage).toContain("data-home-wizard-advance");
    expect(stage).toContain("const advance = filter.goal");
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
