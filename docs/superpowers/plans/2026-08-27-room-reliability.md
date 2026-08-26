# Room Reliability Implementation Plan

> **For implementation:** execute in small TDD slices; run the named test after each slice before proceeding.

**Goal:** eliminate divergent Room rosters, missing recruiting actions, unreliable chat visibility, and stale resume UI without changing Production data.

**Architecture:** preserve the existing Room-first model. Correct the projection from server member state to live UI and introduce a small `RoomSnapshot` API boundary for targeted reconciliation. Realtime remains a wake-up signal; the server response owns state.

## Slice 1 — Live roster and Casual fit table

**Files:**
- Modify: `public/js/pages/session-preview.js`
- Test: `tests/room-live-projection.test.ts`

1. Add a failing browser-level rendering test for an exited member not appearing in the player rail.
2. Add a failing test for a Casual Room returning only Game, Purpose, and Microphone labels.
3. Run the single test and observe failure.
4. Change the projection to use `activeMembers`; condition the fit rows on Casual mode; use `休闲` and `麦克风` labels.
5. Re-run the test and relevant existing session tests.

## Slice 2 — Recruiting action during shell hydration

**Files:**
- Modify: `public/js/pages/session-preview.js`
- Test: `tests/recruiting-shell-actions.test.ts`

1. Add a failing test showing a recruiting Room shell exposes Stop Recruiting before the group identifier is hydrated.
2. Run test red.
3. Remove the client-only group-id gate; action resolution remains server-authorized.
4. Re-run green.

## Slice 3 — Snapshot boundary and local reconciliation

**Files:**
- Add: `src/app/api/room/[code]/snapshot/route.ts`
- Modify: `src/lib/api.ts`, `public/js/api.js`, `public/js/app.js`
- Test: route and client contract tests

1. Add a failing test for an authenticated member receiving an enriched snapshot with active roster and no inactive primary members.
2. Implement the read-only route using existing server membership resolution.
3. Add a client read method and make Room-local updates reconcile through it without calling `render()`.
4. Verify no full page render or chat subscription teardown follows a member-only update.

## Slice 4 — Chat acknowledgement and recovery

**Files:**
- Modify: room chat API route/service and `public/js/app.js`
- Test: `tests/room-chat-reliability.test.ts`

1. Add tests for server-returned created message, duplicate-safe append, and history refresh after realtime reconnect.
2. Make send return the persisted message and render a pending/failed state.
3. On realtime reconnect or error, fetch the server history and merge by message id.
4. Verify messages from both participants converge with a controlled two-client integration test where available.

## Slice 5 — Regression and readiness

1. Run all focused tests, `pnpm typecheck`, full `pnpm test`, and `pnpm build`.
2. Use synthetic accounts only in an authorized environment to run Ranked pair, Casual backfill, member exit, immediate leave, reconnect, and chat convergence.
3. Document observed result, remaining issues, and whether a separate schema/event phase is needed. Do not deploy unless explicitly requested after review.
