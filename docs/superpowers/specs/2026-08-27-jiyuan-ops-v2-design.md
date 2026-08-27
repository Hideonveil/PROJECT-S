# Jiyuan OPS V2 design

## Decision

Replace the custom `/ops` implementation with three internal, self-hosted tools:

| Tool | Sole responsibility | Access |
| --- | --- | --- |
| Appsmith | live operations and carefully limited interventions | SSH tunnel only |
| Metabase | user, product, and acquisition analysis | SSH tunnel only |
| Grafana | production, API, infrastructure, and matcher health | SSH tunnel only |

All services bind to `127.0.0.1` on the production host. No dashboard port, database credential, or service-role credential is exposed to a browser or public network.

## Existing facts and V1 inventory

The old `/ops` page combines trend analytics, feedback, an old password gate, a live count, and a legacy two-user manual-match UI. Its surviving requirements are: live counts, user visibility, room visibility, feedback triage, and human matchmaking intervention. Its implementation is not reused.

The production source of truth remains the current Room-first matching model:

- `matchmaking_tickets` is the current matching intent.
- Ranked uses a pair reservation and the existing Room/Session lifecycle.
- Casual uses a group tied to an existing Room; `forming`, `backfilling`, `locked`, and `formal` remain lifecycle semantics, not separate user-facing rooms.
- `rooms`, `room_members`, and `sessions` are the authoritative lifecycle entities.
- `matchmaking_state_events`, `product_events`, `matchmaking_runtime_minute`, and `matchmaking_runtime_events` already provide event and runtime facts.

## Deployment topology

Create `deploy/ops-v2/` as a separate Compose project. It contains Appsmith, Metabase, Grafana, Prometheus, node-exporter, and cAdvisor. Persistent state uses named Docker volumes. Service configuration is committed only as templates; passwords, encryption material, and credentials live in an untracked server-only environment file.

The application exposes an internal metrics endpoint only to the local Docker network. Prometheus scrapes that endpoint plus node-exporter and cAdvisor. Grafana is provisioned with the Prometheus data source and dashboard JSON. Database-derived matcher telemetry is exposed by the application in Prometheus format, not by granting Grafana a production write role.

Metabase and Appsmith use narrow, server-side HTTPS APIs initially. A later read-only Postgres role is optional only after the connection and least-privilege migration have been verified. This avoids publishing a database connection string or giving Appsmith arbitrary production SQL access.

## Appsmith operations API

Add a versioned `/api/internal/ops-v2` API protected by a server-side shared credential stored only in Appsmith and the Jiyuan server environment. The API accepts no browser-supplied service key.

Read endpoints:

- `live`: headline counts, ranked/casual pool breakdown, waiting bands, recent activity, and event feed.
- `users`: filtered user lifecycle rows and a single User Inspector resolver.
- `rooms`: Room Inspector rows and anomaly flags.
- `contacts`: contact list and status.

Mutation endpoints:

- `ranked/preview` and `ranked/force-match`.
- `casual/preview-attach`, `casual/attach`, and `casual/lock`.
- `contacts/:id/status`.

Every mutation validates operator identity, reloads live state, calls current matching domain logic and RPCs, records a before/result audit record, and returns a typed result. No endpoint performs free-form SQL or inserts pairs, rooms, sessions, or members directly.

## Inspectors and anomaly detection

The User Inspector resolves the user lifecycle from presence, ticket, pair/group, room, session, and active membership. It must identify invalid resume candidates instead of treating `active room_member` as recoverable by itself.

The Room Inspector displays Room mode, status, formation state, members, associated ticket/group/session, age, and safe anomaly flags. First release flags: long wait, orphan, terminal room with active member, invalid resume, duplicate active ticket/member, and room/session state inconsistency. Flags are diagnostic only; they never delete or repair production state automatically.

## Manual matching contract

Ranked preview is read-only compatibility evaluation followed by force-match through the normal pair reservation/presentation path. Casual preview selects an existing compatible forming/backfilling Room, then attaches through the normal group-member reservation path. Locking uses the normal group/Room lock path. All actions require an operator reason and append `ops_audit_log`.

## Analytics and monitoring

Metabase’s first collection is `JIYUAN GROWTH`: total/new/DAU/returning users, D1/D3/D7, ranked/casual usage, rooms/sessions, median/P95 wait time, and reliable acquisition dimensions only. Synthetic accounts are excluded by their permanent synthetic marker.

Grafana’s first dashboard is `JIYUAN PRODUCTION`: app/container health, DB proxy/API traffic, matcher rate/outcome ratios, real SQL serialization failures distinct from business conflicts, realtime/presence errors, and storm status. A missing query result is represented as `NO DATA`, never as zero. Alert rules cover sustained CPU, 5xx/timeout spikes, SQL 40001 spikes, matcher conflict spikes, and container restart/OOM.

## Verification and rollout

1. Unit/contract tests cover authorization, resolver truth, auditor records, preview/no-mutation behavior, normal matching routing, synthetic exclusion, metrics serialization, and no-data semantics.
2. Start internal services through the separate Compose project; verify they are only locally reachable.
3. Configure Appsmith pages against the protected API and run synthetic smoke: live counts, user/room resolver, contact state, ranked preview/force match, casual attach/lock, and terminal convergence.
4. Verify Metabase and Grafana dashboards with synthetic traffic; ensure synthetic accounts do not enter growth totals.
5. Deploy only after smoke reports zero new duplicate, ghost, and active residue.
6. Retire `/ops` only after all three systems are ready; until then it is an explicitly labelled fallback.

## Non-goals

- No new matching state machine or shadow Room/Ticket model.
- No automatic database cleanup, state repair, or destructive admin action.
- No arbitrary SQL in Appsmith.
- No public dashboard endpoint, public registration, or browser-held production secret.
- No inferred school/channel attribution from usernames or IP addresses.
