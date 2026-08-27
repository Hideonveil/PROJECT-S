# Jiyuan OPS V2 Appsmith Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the private Appsmith-based Jiyuan LIVE operations cockpit, backed by the current Room-first production domain model and audited matching interventions.

**Architecture:** Appsmith calls protected Jiyuan server APIs; no Appsmith page has a direct production-SQL path. Resolver functions project existing tickets, groups, rooms, members, sessions, feedback, events, and telemetry into operator views. All mutations call current domain/RPC lifecycle operations and record audits.

**Tech Stack:** Next.js 15, TypeScript, Supabase RPC, PostgreSQL migration, Vitest, Docker Compose, Appsmith CE.

**Spec:** `docs/superpowers/specs/2026-08-27-jiyuan-ops-v2-design.md`

## Global Constraints

- Bind dashboard services to `127.0.0.1`; SSH tunnel is the only access path.
- Never expose a service-role key, database credential, or OPS secret to browser/public routes.
- Do not create duplicate matching, Room, or user state.
- Every mutation rechecks live state, calls existing lifecycle functions, and appends an audit record.
- Synthetic users are excluded from growth metrics; anomaly detection is read-only.

---

### Task 1: Secure contract and audit record

**Files:**
- Create: `src/lib/ops-v2/types.ts`
- Create: `src/lib/ops-v2/auth.ts`
- Create: `src/lib/ops-v2/auth.test.ts`
- Create: `supabase/migrations/20260827100000_ops_v2_audit.sql`
- Test: `tests/ops-v2-audit-contract.test.ts`

**Interfaces:** `requireOpsV2Authorization(request): Promise<OpsV2Actor>` and `appendOpsAudit(input: OpsAuditInput): Promise<void>`.

- [ ] **Step 1: Write failing authorization/audit tests**

```ts
expect(await requireOpsV2Authorization(requestWithoutKey)).rejects.toMatchObject({ status: 401 });
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run src/lib/ops-v2/auth.test.ts tests/ops-v2-audit-contract.test.ts`

Expected: missing module/migration failure.

- [ ] **Step 3: Implement protected API key verification and append-only audit schema**

```ts
return sameSecret(env('OPS_V2_API_KEY'), request.headers.get('x-jiyuan-ops-key') || '');
```

Migration requirements: `ops_audit_log`; RLS enabled; public/anon/authenticated revoked; only service role can select/insert; timestamp/action/target indexes; no credentials stored.

- [ ] **Step 4: Verify tests and typecheck**

Run: `pnpm vitest run src/lib/ops-v2/auth.test.ts tests/ops-v2-audit-contract.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add protected ops v2 audit contract"
```

### Task 2: Live, user, room, contact, and anomaly read models

**Files:**
- Create: `src/lib/ops-v2/read-model.ts`
- Create: `src/lib/ops-v2/read-model.test.ts`
- Create: `src/app/api/internal/ops-v2/live/route.ts`
- Create: `src/app/api/internal/ops-v2/users/route.ts`
- Create: `src/app/api/internal/ops-v2/users/[userId]/route.ts`
- Create: `src/app/api/internal/ops-v2/rooms/route.ts`
- Create: `src/app/api/internal/ops-v2/contacts/route.ts`
- Test: `tests/ops-v2-live-contract.test.ts`

**Interfaces:** `resolveLiveOpsSnapshot`, `resolveUserLifecycle`, and `resolveRoomInspector`.

- [ ] **Step 1: Write failing lifecycle truth tests**

```ts
expect(flagRoom({ status: 'completed', activeMembers: 1 })).toContain('TERMINAL_ROOM_ACTIVE_MEMBER');
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/lib/ops-v2/read-model.test.ts tests/ops-v2-live-contract.test.ts`

Expected: missing resolver failure.

- [ ] **Step 3: Implement resolvers using existing production tables only**

Use `profiles`, `matchmaking_tickets`, `matchmaking_pairs`, `matchmaking_groups`, `matchmaking_group_members`, `rooms`, `room_members`, `sessions`, `feedback`, `matchmaking_state_events`, `matchmaking_runtime_minute`, and `matchmaking_runtime_events`. Treat `completed`, `cancelled`, `closed`, and `finished` rooms as terminal. Represent unavailable telemetry as `NO_DATA`, not zero.

- [ ] **Step 4: Write/verify route tests**

```ts
expect((await GET(authorizedRequest)).status).toBe(200);
```

Run: `pnpm vitest run src/lib/ops-v2/read-model.test.ts tests/ops-v2-live-contract.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add ops v2 live and inspector read models"
```

### Task 3: Current-domain manual interventions

**Files:**
- Modify: `src/lib/matchmaking/service.ts`
- Create: `src/lib/ops-v2/interventions.ts`
- Create: `src/lib/ops-v2/interventions.test.ts`
- Create: `src/app/api/internal/ops-v2/ranked/preview/route.ts`
- Create: `src/app/api/internal/ops-v2/ranked/force-match/route.ts`
- Create: `src/app/api/internal/ops-v2/casual/preview-attach/route.ts`
- Create: `src/app/api/internal/ops-v2/casual/attach/route.ts`
- Create: `src/app/api/internal/ops-v2/casual/lock/route.ts`
- Test: `tests/ops-v2-intervention-contract.test.ts`

**Interfaces:** `previewRankedMatch`, `forceRankedMatch`, `previewCasualAttach`, `attachCasualUser`, `lockCasualRoom`.

- [ ] **Step 1: Write failing no-direct-entity tests**

```ts
expect(sourceFor('forceRankedMatch')).toContain('matchmaking_reserve_pair');
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run src/lib/ops-v2/interventions.test.ts tests/ops-v2-intervention-contract.test.ts`

Expected: missing intervention failure.

- [ ] **Step 3: Implement preview/action routing through current RPCs**

Ranked force match must use pair reservation, presentation, and existing auto-connect. Casual attach must use `matchmaking_reserve_group_member`; Casual lock must use the current lock/group lifecycle. Re-read state before mutation; reject stale, terminal, mode-incompatible, or full values; attach `source: 'ops_v2'`; no blind retry; append success/failure audit.

- [ ] **Step 4: Verify meaningful outcomes**

```ts
expect(await attachCasualUser(fullRoom)).toMatchObject({ reasonCode: 'GROUP_FULL' });
```

Run: `pnpm vitest run src/lib/ops-v2/interventions.test.ts tests/ops-v2-intervention-contract.test.ts && pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add audited ops v2 matching interventions"
```

### Task 4: Private Appsmith service and cockpit artifact

**Files:**
- Create: `deploy/ops-v2/compose.yaml`
- Create: `deploy/ops-v2/.env.example`
- Create: `deploy/ops-v2/README.md`
- Create: `deploy/ops-v2/appsmith/JIYUAN_OPS_V2.md`
- Create: `deploy/ops-v2/appsmith/import/`
- Test: `tests/ops-v2-deploy-contract.test.ts`
- Test: `tests/ops-v2-appsmith-artifact-contract.test.ts`

**Interfaces:** Appsmith service on `127.0.0.1:8081`; pages `LIVE`, `USERS`, `ROOMS`, `CONTACTS`, and `MANUAL MATCH`; REST actions `LiveSnapshot`, `UserInspector`, `RoomInspector`, `RankedPreview`, `RankedForceMatch`, `CasualPreviewAttach`, `CasualAttach`, `CasualLock`, and `ContactStatus`.

- [ ] **Step 1: Write failing deployment/artifact tests**

```ts
expect(compose).toContain('127.0.0.1:8081:80');
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/ops-v2-deploy-contract.test.ts tests/ops-v2-appsmith-artifact-contract.test.ts`

Expected: missing Compose/artifact failure.

- [ ] **Step 3: Implement private compose and import artifact**

Pin an official Appsmith CE release after checking upstream release notes. Disable public signup. Use persistent storage. The runbook covers server-only encryption keys, invite-only initial admin, SSH tunnel, health check, export/backup, and REST datasource headers. LIVE shows headline counts, pool breakdowns, last-five-minute activity, and event feed. Contact state changes and manual operations are API-only. No arbitrary SQL action or database datasource is configured.

- [ ] **Step 4: Verify configuration and secret hygiene**

Run: `pnpm vitest run tests/ops-v2-deploy-contract.test.ts tests/ops-v2-appsmith-artifact-contract.test.ts && docker compose -f deploy/ops-v2/compose.yaml config`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add private Appsmith ops v2 cockpit"
```

### Task 5: Synthetic smoke and internal deployment

**Files:**
- Create: `tools/ops-v2/smoke.mjs`
- Create: `tests/ops-v2-smoke-contract.test.ts`
- Modify: `deploy/ops-v2/README.md`

**Interfaces:** `node tools/ops-v2/smoke.mjs --base-url <internal-app-url>` reports `RANKED_MANUAL_MATCH`, `CASUAL_MANUAL_INTERVENTION`, `NEW_GHOST`, `NEW_DUPLICATE`, and `NEW_ACTIVE_RESIDUE`.

- [ ] **Step 1: Write failing smoke contract test**

```ts
expect(smoke).toContain('NEW_ACTIVE_RESIDUE');
```

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/ops-v2-smoke-contract.test.ts`

Expected: missing runner failure.

- [ ] **Step 3: Implement safe smoke runner**

Read synthetic credentials only at runtime from server environment. It records baseline IDs, uses normal lifecycle APIs, verifies Appsmith APIs and actions, terminalizes all test business entities normally, and reports only new residue. It never writes credentials, tokens, or authorization headers to source/evidence.

- [ ] **Step 4: Verify and deploy**

Run: `pnpm vitest run tests/ops-v2-smoke-contract.test.ts && pnpm typecheck && pnpm test && pnpm build`

Deploy the separate private Compose project, configure server-only secrets, run the synthetic smoke, and require zero new duplicate, ghost, and active residue.

- [ ] **Step 5: Commit and report milestone**

```bash
git commit -m "test: add ops v2 synthetic smoke"
```

Report Appsmith readiness. Keep old `/ops` as `FALLBACK` until the Metabase and Grafana implementation plans are completed.
