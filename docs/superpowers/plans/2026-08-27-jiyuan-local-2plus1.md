# Jiyuan Local 2+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local-only Appsmith, Metabase, and Grafana cockpit that safely consumes current Production facts through SSH tunnels and protected APIs.

**Architecture:** Production retains only the protected OPS API, append-only audit data, and a read-only metrics endpoint. The founder Mac runs Appsmith for actions, Metabase for live/growth read models, and Prometheus/Grafana for technical health; all ports bind to `127.0.0.1`.

**Tech Stack:** Next.js 15, TypeScript, Supabase/PostgreSQL, Docker Compose, Appsmith CE, Metabase, Prometheus, Grafana, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-jiyuan-ops-v2-design.md`

## Global Constraints

- Never run Appsmith, Metabase, Grafana, or Prometheus on the 2 GB Production host.
- Bind every local cockpit port to `127.0.0.1`; use SSH tunnels only.
- Never place a service-role key, database password, access token, or OPS API key in Git or a browser page.
- Appsmith mutations use `/api/internal/ops-v2` only; no direct Production SQL.
- Metabase and Grafana are read-only; `NO DATA` must not be rendered as zero.
- Synthetic accounts are excluded from growth metrics and never expose credentials in evidence.

---

### Task 1: Retire the server-Appsmith assumption and define local service profiles

**Files:**
- Modify: `deploy/ops-v2/compose.yaml`
- Modify: `deploy/ops-v2/.env.example`
- Modify: `deploy/ops-v2/README.md`
- Test: `tests/ops-v2-deploy-contract.test.ts`

**Produces:** local services `appsmith`, `metabase`, `prometheus`, and `grafana`, each loopback-only and configured from an untracked `.env.local`.

- [ ] **Step 1: Write the failing profile test**

```ts
expect(compose).toContain('127.0.0.1:8081:80');
expect(compose).toContain('127.0.0.1:3000:3000');
expect(compose).toContain('127.0.0.1:3001:3000');
expect(compose).not.toContain('/opt/jiyuan');
```

- [ ] **Step 2: Run it and verify failure**

Run: `pnpm vitest run tests/ops-v2-deploy-contract.test.ts`

Expected: FAIL until the local-only services are represented.

- [ ] **Step 3: Implement the local Compose profile**

```yaml
ports:
  - "127.0.0.1:${METABASE_PORT:-3000}:3000"
```

Use named local volumes, a dedicated Metabase application database configuration, persistent Appsmith storage, Grafana provisioning, and no exposed Production port.

- [ ] **Step 4: Verify the profile**

Run: `docker compose -f deploy/ops-v2/compose.yaml config`

Expected: all ports start with `127.0.0.1:` and no secret value is printed.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add local OPS V2 cockpit profile"
```

### Task 2: Finish the protected Production read/action boundary

**Files:**
- Modify: `src/lib/ops-v2/read-model.ts`
- Modify: `src/app/api/internal/ops-v2/live/route.ts`
- Create: `src/app/api/internal/ops-v2/metrics/route.ts`
- Modify: `src/lib/ops-v2/interventions.ts`
- Test: `src/lib/ops-v2/read-model.test.ts`
- Test: `tests/ops-v2-intervention-contract.test.ts`

**Consumes:** existing `requireOpsV2Authorization`, `appendOpsAudit`, and current Matching RPCs.

**Produces:** Appsmith-safe live/inspector/action APIs and a local-tunnel-only metrics response.

- [ ] **Step 1: Write failing read/metrics tests**

```ts
expect(snapshot.counts).toMatchObject({ online: expect.any(Number), matching: expect.any(Number) });
expect(metrics).toContain('jiyuan_matcher_attempts');
expect(metrics).toContain('NO_DATA');
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm vitest run src/lib/ops-v2/read-model.test.ts tests/ops-v2-intervention-contract.test.ts`

Expected: FAIL because the metrics route and no-data representation are absent.

- [ ] **Step 3: Implement minimal production projection**

Expose LIVE counts (online, matching, ranked/casual, mic/rank, wait bands, rooms, sessions, last-five-minute events) from current tables only. Preserve the existing Manual Match V2 preview/force/attach/lock paths and audit every action; do not insert or update Pair/Room/Session directly.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/lib/ops-v2/read-model.test.ts tests/ops-v2-intervention-contract.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: expose local cockpit production facts"
```

### Task 3: Build the local Appsmith operations artifact

**Files:**
- Create: `deploy/ops-v2/appsmith/JIYUAN_OPS_V2.md`
- Create: `deploy/ops-v2/appsmith/import/`
- Test: `tests/ops-v2-appsmith-artifact-contract.test.ts`

**Consumes:** Task 2 REST endpoints.

**Produces:** pages `LIVE`, `USERS`, `ROOMS`, `CONTACTS`, `MANUAL MATCH` with protected REST actions.

- [ ] **Step 1: Write failing artifact test**

```ts
expect(readFileSync(manifest, 'utf8')).toContain('ADMIN_FORCE_RANKED_MATCH');
expect(readFileSync(manifest, 'utf8')).not.toContain('service_role');
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run tests/ops-v2-appsmith-artifact-contract.test.ts`

Expected: FAIL because the import artifact does not exist.

- [ ] **Step 3: Create and configure the local app**

Create REST datasource headers from Appsmith environment binding only. LIVE reads `live`; inspectors call `users` and `rooms`; Contacts PATCH status; Manual Match always runs Preview before Force/Attach/Lock and requires an operator reason.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/ops-v2-appsmith-artifact-contract.test.ts`

Expected: PASS with no direct database datasource or credential literal.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add local Appsmith OPS V2 artifact"
```

### Task 4: Build local Metabase LIVE and GROWTH collections

**Files:**
- Create: `deploy/ops-v2/metabase/README.md`
- Create: `deploy/ops-v2/metabase/questions/`
- Create: `tests/ops-v2-metabase-contract.test.ts`

**Consumes:** a dedicated `analytics_readonly` Production database role via SSH tunnel.

**Produces:** `JIYUAN LIVE` and `JIYUAN GROWTH` dashboards.

- [ ] **Step 1: Write failing dashboard-query contract**

```ts
expect(sql).toMatch(/synthetic_test/i);
expect(sql).toContain('last 5 minutes');
expect(sql).not.toMatch(/insert|update|delete/i);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run tests/ops-v2-metabase-contract.test.ts`

Expected: FAIL because the query collection does not exist.

- [ ] **Step 3: Create read-only questions**

LIVE: Online, Matching, Ranked/Casual, microphone/rank, wait bands, current rooms, playing/session, five-minute activity. GROWTH: total/new/DAU/returning, D1/D3/D7, mode/room/session trends, wait percentiles, and only reliable acquisition fields. Exclude synthetic accounts at query boundary.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/ops-v2-metabase-contract.test.ts`

Expected: PASS; every query is SELECT-only.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add local Metabase live and growth collections"
```

### Task 5: Build local Grafana technical dashboard and smoke

**Files:**
- Create: `deploy/ops-v2/prometheus/prometheus.yml`
- Create: `deploy/ops-v2/grafana/provisioning/datasources/prometheus.yml`
- Create: `deploy/ops-v2/grafana/provisioning/dashboards/jiyuan-production.json`
- Create: `tools/ops-v2/local-smoke.mjs`
- Test: `tests/ops-v2-grafana-contract.test.ts`

**Consumes:** Task 2 metrics endpoint over SSH tunnel.

**Produces:** `JIYUAN PRODUCTION` health dashboard and a safe local smoke runner.

- [ ] **Step 1: Write failing telemetry test**

```ts
expect(dashboard).toContain('MATCHING HEALTH');
expect(dashboard).toContain('SQL 40001');
expect(dashboard).toContain('No data');
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run tests/ops-v2-grafana-contract.test.ts`

Expected: FAIL because provisioning files do not exist.

- [ ] **Step 3: Implement provisioning and smoke**

Dashboard panels cover DB/app health, API 5xx/timeout, matcher attempts/success/conflicts/retries, real SQL 40001, business conflicts, realtime/presence, restart/OOM, and clear storm state. Smoke checks local loopback reachability, API authorization, read-only query availability, and normal synthetic lifecycle convergence without recording secrets.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/ops-v2-grafana-contract.test.ts && pnpm typecheck && pnpm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add local Grafana production cockpit"
```

