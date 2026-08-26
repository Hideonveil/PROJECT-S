# Unified Room Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ranked and Casual share one Room-first user flow while keeping recruitment state separate from the legacy Room/Session status fields.

**Architecture:** Reuse the existing `rooms`, `room_members`, `matchmaking_tickets`, `matchmaking_groups`, and `sessions` tables. Add only a derived recruitment contract to the existing Room API shape; keep `rooms.status` and `formation_state` for compatibility, but make UI decisions from `recruiting`/`recruitmentState`. Ranked automatically locks after the first compatible pair; Casual remains recruiting until full or explicitly locked.

**Tech Stack:** Next.js 15, TypeScript, vanilla browser UI modules, Supabase/PostgreSQL RPCs, Vitest, local production build, Tencent Lighthouse deployment.

**Spec:** User request “00 → ENG-00｜统一 Room 模型，Rank 取消独立‘组房阶段’” in the current task.

## Global Constraints

- Do not add new database tables.
- Do not add a new migration unless a production RPC change is proven necessary; preserve existing schema and legacy status values.
- Do not expose `forming`/`backfilling` as separate user pages or product concepts for Ranked.
- Ranked: Room exists immediately, recruitment stops after the first legal teammate, then Session becomes `ready`.
- Casual: Room exists immediately, members can backfill, and recruitment stops only at hard max or explicit “就这些人”.
- Keep the existing formal Session exit behavior unchanged in this task.
- Keep the configuration-page `NOW MATCHING` sidebar.
- No browser page reload for Room membership/state updates.
- Run targeted tests, TypeScript, production build, and smoke verification before deployment.

### Task 1: Lock the unified Room contract with failing tests

**Files:**
- Create: `tests/unified-room-model-contract.test.ts`
- Modify: none

**Interfaces:**
- The test will define the required source contract for `recruiting`, `recruitmentState`, Ranked auto-lock, Casual backfill, one Room surface, and preserved `NOW MATCHING`.

- [ ] **Step 1: Write the failing test**

  Assert that the Room type and server response expose `recruiting`/`recruitmentState`, that the Room UI consumes the derived recruitment contract, and that Ranked/Casual RPC paths preserve the same Room-first flow.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `NODE_BIN=/Users/jasonhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node; "$NODE_BIN" node_modules/vitest/vitest.mjs run tests/unified-room-model-contract.test.ts`

  Expected: FAIL because the new recruitment contract is not present yet.

### Task 2: Add the derived recruitment contract without changing schema

**Files:**
- Modify: `src/lib/types.ts:52-71`
- Modify: `src/lib/api.ts:331-350`
- Modify: `public/js/app.js:1480-1540`
- Test: `tests/unified-room-model-contract.test.ts`

**Interfaces:**
- `Room.recruiting?: boolean` — true while the Room is accepting compatible members.
- `Room.recruitmentState?: "recruiting" | "locked" | null` — user-facing recruitment state.
- `enrichRoom()` returns the derived values from the existing Room/Session/formation data.
- `normalizeServerRoom()` preserves the values for the browser.

- [ ] **Step 1: Implement the minimal derived state**

  Compute recruiting as true for a valid Room-first `connecting` Room without a terminal Session, or for an existing `forming`/`backfilling` Room. Compute locked as false recruiting for `locked`/`formal` or a formal Session. Do not add a database column.

- [ ] **Step 2: Run the contract test**

  Run the command from Task 1.

  Expected: PASS.

### Task 3: Make the shared Room UI use recruitment semantics

**Files:**
- Modify: `public/js/pages/session-preview.js:120-240`
- Modify: `public/js/app.js:1000-1080, 1608-1650, 1870-1950`
- Modify: `public/js/realtime.js` only if the existing Room event path needs the same incremental patch
- Test: `tests/unified-room-model-contract.test.ts`, `tests/realtime-patch-contract.test.ts`

**Interfaces:**
- The Room page uses `room.recruiting` and does not branch Ranked into a separate Room page.
- Membership and recruitment updates patch the existing Room surface without a browser reload or legacy `/matching` page.

- [ ] **Step 1: Write the failing UI assertions**

  Assert that the Room model uses the derived recruitment flag, that the Ranked one-teammate state can render a single empty slot and waiting copy, that the Casual state keeps backfill copy, and that legacy `/matching` redirects to the shared Room/home surface.

- [ ] **Step 2: Run the UI assertions to verify they fail**

  Run: `NODE_BIN=/Users/jasonhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node; "$NODE_BIN" node_modules/vitest/vitest.mjs run tests/unified-room-model-contract.test.ts tests/realtime-patch-contract.test.ts`

  Expected: FAIL on the old `isForming`-driven presentation.

- [ ] **Step 3: Implement the minimal UI change**

  Replace user-facing `forming` decisions with `recruiting`, keep the same Room markup for Ranked/Casual, preserve the single-member quiet state, and update the existing Room DOM patch path rather than navigating or reloading.

- [ ] **Step 4: Run the targeted UI tests**

  Run the same command.

  Expected: PASS.

### Task 4: Verify Ranked auto-lock and Casual continued recruitment

**Files:**
- Modify: `src/lib/matchmaking/service.ts` only if the current runtime path does not enforce the specified behavior
- Modify: `supabase/migrations/20260825230000_room_first_matchmaking.sql` only if the deployed RPC definition must be corrected; if changed, create a new migration with the Supabase CLI first
- Test: `tests/unified-room-model-contract.test.ts`, `tests/room-first-ui-contract.test.ts`, matching service tests if applicable

**Interfaces:**
- Ranked reservation produces one shared Room, adds the second member, sets recruitment locked/formal, and creates `Session.ready`.
- Casual reservation keeps the shared Room `connecting` and recruitment active until hard max or `matchmaking_lock_forming_group`.

- [ ] **Step 1: Inspect the current effective RPC ordering**

  Confirm that the latest Room-first RPC definitions are the effective definitions and that no legacy function can recreate a separate waiting page or a second Room.

- [ ] **Step 2: Add only a failing regression if a gap is found**

  The regression must assert the exact missing transition, such as Ranked `reserve_pair` setting formal/ready or Casual `reserve_group_member` keeping backfill active.

- [ ] **Step 3: Apply the smallest implementation fix**

  Reuse existing RPCs and states; do not change formal Session exit behavior.

- [ ] **Step 4: Run matching regression tests**

  Run: `NODE_BIN=/Users/jasonhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node; "$NODE_BIN" node_modules/vitest/vitest.mjs run tests/unified-room-model-contract.test.ts tests/room-first-ui-contract.test.ts tests/reservation-conflict-guard.contract.test.ts`

  Expected: PASS.

### Task 5: Targeted smoke, build, and deployment

**Files:**
- Modify: deployment files only if the existing production deployment procedure requires the new static/API assets
- Test: browser smoke at the configured Production URL and local targeted tests

**Interfaces:**
- Production must serve the unified Room UI and the corresponding server API behavior from one deployed revision.

- [ ] **Step 1: Run targeted test, typecheck, and production build**

  Run the targeted matching tests, `tsc --noEmit`, and `PATH="/Users/jasonhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm build`.

- [ ] **Step 2: Smoke the required flows**

  Verify Rank start → shared Room → waiting → second member → automatic lock/Session; Casual start → shared Room → backfill → continued recruiting; legacy `/matching` does not render a standalone waiting page; `NOW MATCHING` remains on the configuration page; Room membership updates do not reload the browser; no obvious console errors.

- [ ] **Step 3: Deploy the approved revision**

  Use the established Tencent Lighthouse deployment path from the canonical repository. Do not run migrations unless Task 4 proves an already-deployed RPC must change and the user’s current request authorizes that database deployment.

- [ ] **Step 4: Verify Production after deployment**

  Check the Production health endpoint and the deployed UI/API revision, then report only the requested status fields.
