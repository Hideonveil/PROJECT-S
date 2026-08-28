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

- [ ] Extract Ranked candidate/reservation flow.
- [ ] Extract Casual group/backfill flow.
- [ ] Extract direct public join flow.
- [ ] Extract OPS matching interventions.
- [ ] Keep one per-user single-flight owner.
- [ ] Keep `service.ts` as a small orchestration interface, not a second implementation.

## Phase 3 — Room read model

- [ ] Move Room enrichment and membership projection behind one module.
- [ ] Move resume candidate resolution behind the same module.
- [ ] Separate shell reads from full hydration reads.
- [ ] Remove route-local Room reconstruction.
- [ ] Replace source-placement tests with interface-level tests where feasible.

## Phase 4 — Browser Room controller

- [ ] Extract authoritative snapshot reconciliation from `app.js`.
- [ ] Extract Room-scoped subscriptions and refresh scheduling.
- [ ] Extract chat load/send/reconcile behavior.
- [ ] Extract explicit leave and local tombstone behavior.
- [ ] Verify no full-page render for member/chat/recruitment updates.

## Phase 5 — Browser application shell

- [ ] Extract routing and navigation.
- [ ] Split the global click handler into domain command handlers.
- [ ] Extract authentication and session restoration.
- [ ] Remove retired matching-page dependencies after contract verification.
- [ ] Reduce `app.js` below 1,500 lines.

## Phase 6 — OPS

- [ ] Split dashboard polling, session, manual match and presentation modules.
- [ ] Remove duplicate legacy manual-match logic if no caller remains.
- [ ] Keep mutation paths behind protected Admin operations.

## Phase 7 — Repository hygiene

- [ ] Reconcile README structure with the current Room-first product.
- [ ] Mark compatibility adapters with removal conditions.
- [ ] Add a lightweight architecture hotspot check.
- [ ] Classify source-text tests: security artifact, migration artifact, or replaceable behavior test.
- [ ] Run final typecheck, full tests, build and two-axis review.
