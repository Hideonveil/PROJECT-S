# Codebase Health Design — 2026-08-28

## Objective

Make Jiyuan easier to change without altering Production behavior. The work is
an incremental restructuring program, not a rewrite. Every slice must preserve
the current Room-first, Matching, Session, Realtime, Presence and OPS contracts.

## Invariants

1. Production behavior and database semantics stay unchanged unless a separate
   product or bug-fix decision explicitly changes them.
2. Historical Supabase migrations are immutable evidence. Architecture cleanup
   may add forward-only migrations only when a real schema change is required.
3. Existing public module interfaces remain stable during extraction. A caller
   should not need to understand where an implementation moved.
4. Each extraction must reduce caller knowledge, concentrate related behavior,
   and keep one authoritative implementation.
5. No parallel frontend, matcher, Room or Session implementation may be created.
6. Untracked capacity evidence under `output/` is user-owned and remains untouched.

## Current health baseline

- TypeScript strict typecheck: passing.
- Automated tests before restructuring: 89 files / 395 tests passing.
- Main complexity concentrations:
  - `public/js/app.js`: 4,726 lines; routing, rendering, Room reconciliation,
    chat, Presence, authentication and global event dispatch are coupled.
  - `src/lib/matchmaking/service.ts`: 1,218 lines before Phase 1; scheduling,
    reservations, matching, OPS intervention and status projection were mixed.
  - `src/lib/api.ts`: 701 lines and 33 direct admin-client entry points; public
    directory, pool counts, Room read model and Session read model are mixed.
  - `src/app/ops/page.tsx`: 617 lines; session, polling, manual matching and
    dashboard presentation live in one React module.
- Several contract tests assert source placement rather than behavior. These
  tests make safe extraction look like a regression and must be replaced or
  narrowed as modules are moved.

## Target modules

### Matching

External seam: the existing functions exported by `matchmaking/service.ts`.

Internal modules:

- scheduler: cadence, lease, fairness, bounded concurrency, cooldown and fault isolation;
- reservations: typed business-conflict classification and bounded metrics;
- attempt context: one ticket attempt's outcome and telemetry;
- records: database-row to domain-model mapping;
- ranked matching, Casual recruitment, direct join and OPS intervention in later slices.

### Room read model

External seam: `resolveActiveRoom`, `activeRoomFor`, `activeRoomShellFor` and
`enrichRoom`.

The implementation owns membership projection, ticket/group linkage, Session
linkage, recruitment state and resume eligibility. Routes must not rebuild this
logic independently.

### Browser application

External seam: navigation commands and a server-authoritative Room snapshot.

Internal modules:

- application router and persistent shell;
- Room controller and snapshot reconciliation;
- Room chat controller;
- matchmaking/start/cancel commands;
- authentication/session restoration;
- page-specific event handlers.

The browser must retain one render owner. Extracted modules return commands or
patches; they do not introduce a second global renderer.

### OPS

External seam: protected OPS routes and explicit operator commands.

Internal modules:

- session/authentication;
- read-only dashboard polling;
- manual-match preview/execute flow;
- presentation sections.

## Verification gate per slice

1. Focused tests for the touched seam.
2. Full typecheck.
3. Full Vitest suite; timing flakes must be rerun and recorded, not hidden.
4. Production build.
5. Diff review for both project standards and this design.
6. No deployment is implied by architecture cleanup; deployment requires an
   explicit release decision.

## Completion definition

- No production source file above 1,500 lines without an explicit documented exception.
- No function above 150 lines without an explicit documented exception.
- Matching scheduling and business matching are independently understandable.
- Room read/reconcile behavior has one authoritative module on server and one
  controller on the browser.
- Global event dispatch delegates to page/domain handlers instead of containing
  the behavior of every screen.
- Source-text contract tests are limited to security/deployment artifacts where
  text itself is the contract; business behavior is tested through interfaces.
- Typecheck, tests and build remain green.
