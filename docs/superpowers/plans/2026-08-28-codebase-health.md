# Codebase Health Implementation Plan — 2026-08-28

## Phase 1 — Matching scheduler extraction

- [x] Extract row/domain mapping.
- [x] Extract attempt context and business-conflict recording.
- [x] Extract reservation classification and bounded metrics.
- [x] Extract persistent scheduler, lease, cooldown and concurrency.
- [x] Preserve `startPersistentMatcher()` as the boot interface.
- [x] Add direct tests for reservation classification.
- [x] Complete full build and review gate.

## Phase 2 — Matching business modules

- [x] Extract Ranked candidate/reservation flow.
- [x] Extract Casual group/backfill flow.
- [x] Extract direct public join flow.
- [x] Extract OPS matching interventions.
- [x] Keep one per-user serial mutation owner without swallowing distinct operations.
- [x] Keep `service.ts` as a small orchestration interface, not a second implementation.

## Phase 3 — Room read model

- [x] Move Room enrichment and membership projection behind one module.
- [x] Move resume candidate resolution behind the same module.
- [x] Centralize the shared shell/hydration presentation rules.
- [x] Separate shell reads from full hydration reads at the database-query boundary.
- [ ] Remove route-local Room reconstruction.
- [ ] Replace source-placement tests with interface-level tests where feasible.

## Phase 4 — Browser Room controller

- [x] Extract pure matchmaking snapshot validation and partial-response merging from `app.js`.
- [x] Extract authoritative Room snapshot reconciliation from `app.js`.
- [ ] Extract Room-scoped subscriptions and refresh scheduling.
- [x] Extract chat load/send/reconcile behavior.
- [x] Extract explicit leave and local tombstone behavior.
- [x] Verify no full-page render for member/chat/recruitment updates.

## Phase 5 — Browser application shell

- [ ] Extract routing and navigation.
- [ ] Split the global click handler into domain command handlers.
- [x] Extract authentication and session restoration.
- [ ] Remove retired matching-page dependencies after contract verification.
- [ ] Reduce `app.js` below 1,500 lines.

## Phase 6 — OPS

- [ ] Split dashboard polling, session, manual match and presentation modules. (Presentation and data model complete; hooks remain.)
- [ ] Remove duplicate legacy manual-match logic if no caller remains.
- [ ] Keep mutation paths behind protected Admin operations.

## Phase 7 — Repository hygiene

- [x] Reconcile README structure with the current Room-first product.
- [ ] Mark compatibility adapters with removal conditions.
- [x] Add a lightweight architecture hotspot check.
- [ ] Classify source-text tests: security artifact, migration artifact, or replaceable behavior test.
- [x] Run final typecheck, full tests and Production build for completed slices.

## Phase 8 — Multi-game extension boundary

- [x] Record the game-expansion contract in the project fact source (DEC-015).
- [ ] Add one shared `GameDefinition` registry used by client and server.
- [ ] Move Deadlock rank, role, team-size and compatibility rules behind a Deadlock adapter.
- [ ] Remove scattered Deadlock branches from generic orchestration before a second Production game.
- [ ] Add a second fake-game contract suite before integrating real game assets or rules.
- [ ] Make the capacity runner select scenarios through the same game definition boundary.

## 2026-08-29 checkpoint

- `matchmaking/service.ts`: 1,218 → 682 lines.
- `api.ts`: 701 → 638 lines, with shared Room presentation rules isolated.
- `app.js`: 4,726 → 4,649 lines, with matchmaking snapshot merging isolated.
- Regression baseline: 89 files / 395 tests → 97 files / 418 tests.
- Review follow-up adds behavioral guards for per-user serial execution,
  fresh/regular queue execution, bounded concurrency, recurring jitter and
  durable cooldown/quarantine state.
- All completed slices pass typecheck, the full test suite and Production build.
- Capacity evidence under `output/` remains untouched.

## 2026-08-29 continuation

- `matchmaking/service.ts`: 682 → 218 lines; Casual, status and direct join now have explicit owners.
- `api.ts`: 638 → 326 lines; Room eligibility, shell reads and full hydration now live in `room-read-model.ts`.
- `app.js`: 4,649 → 4,110 lines; Room chat and authentication/session restoration now use dedicated controllers.
- `ops/page.tsx`: 617 → 426 lines; presentation components and data/formatting types are separate.
- Architecture ratchets prevent these four hotspots from silently returning to their former size.
- Remaining work is explicit: authoritative Room reconciliation/leave controller, route/action splitting, and OPS data hooks.
- Final regression baseline for this checkpoint: 98 files / 422 tests; typecheck and Production build pass.
- Multi-game expansion is now governed by DEC-015; implementation is intentionally deferred until a second game enters scope.

## 2026-08-29 Room Authority completion

- Browser Room identity, monotonic versions, source precedence, resume decisions and exit tombstones now have one owner: `public/js/room-authority.js`.
- Start and explicit resume may switch the canonical Room; background state, hydration and Realtime may only update that same Room.
- Every state read carries the Room generation captured when the request starts; a delayed null cannot clear a newer Room.
- An authoritative null, terminal Session, or completed explicit exit can clear the Room; exit-pending nulls and delayed snapshots cannot reopen or erase the accepted Room.
- Equal-version shell snapshots may supplement missing fields but cannot overwrite a fully hydrated roster.
- Standard explicit Room exits share one `runRoomExit` transaction so success and failure always settle the same tombstone; matchmaking cancellation keeps its separate uncertain-result reconciliation path.
- Member hydration, recruitment votes, Goodbye state and chat patch the mounted Room instead of replacing the full page.
- The retired standalone Matching flow and old three-step Casual assumptions were removed from browser regression tests.
- Decorative ticker layers no longer intercept Room/matching actions at short desktop viewports.
- Regression baseline: 99 files / 434 tests, 31 browser lifecycle tests, typecheck and Production build pass.
