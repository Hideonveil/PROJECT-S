# Jiyuan OPS V2 design

## Decision

Replace the custom `/ops` implementation with a lightweight production action surface and two local-only dashboards:

| Tool | Sole responsibility | Access |
| --- | --- | --- |
| Production `/ops` | carefully limited interventions and inspectors | authenticated Jiyuan admin access |
| Local Metabase | live operations, user/product, and acquisition analysis | localhost on the founder Mac |
| Local Grafana | production, API, infrastructure, and matcher health | localhost on the founder Mac |

No dashboard runs on the 2 GB production host. Metabase and Grafana bind to `127.0.0.1` on the founder Mac and reach production through SSH tunnels. No dashboard port, database credential, or service-role credential is exposed to a public network.

## Existing facts and V1 inventory

The old `/ops` page combines trend analytics, feedback, an old password gate, a live count, and a legacy two-user manual-match UI. Its surviving requirements are: live counts, user visibility, room visibility, feedback triage, and human matchmaking intervention. Its implementation is not reused.

The production source of truth remains the current Room-first matching model:

- `matchmaking_tickets` is the current matching intent.
- Ranked uses a pair reservation and the existing Room/Session lifecycle.
- Casual uses a group tied to an existing Room; `forming`, `backfilling`, `locked`, and `formal` remain lifecycle semantics, not separate user-facing rooms.
- `rooms`, `room_members`, and `sessions` are the authoritative lifecycle entities.
- `matchmaking_state_events`, `product_events`, `matchmaking_runtime_minute`, and `matchmaking_runtime_events` already provide event and runtime facts.

## Deployment topology

Create local-only `deploy/ops-v2/` Compose profiles for Metabase and Grafana. Persistent state uses named local Docker volumes. Service configuration is committed only as templates; passwords, tunnel credentials, and read-only database credentials live in an untracked local environment file.

The production application exposes a protected, read-only metrics endpoint. Local Prometheus scrapes it over the SSH tunnel together with production-safe system metrics. Grafana is provisioned locally with the Prometheus data source and dashboard JSON. Database-derived matcher telemetry is exposed by the application in Prometheus format, not by granting Grafana a production write role.

Metabase uses a dedicated production read-only role over an SSH tunnel after the least-privilege role and connection are verified. This avoids publishing a database connection string or granting arbitrary production SQL access.

## Production `/ops` API

Add a versioned `/api/internal/ops-v2` API protected by the existing server-side admin authorization boundary. The API accepts no browser-supplied service key.

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

## Local analytics and monitoring

Metabase has two first-class collections: `JIYUAN LIVE` and `JIYUAN GROWTH`. LIVE contains online, matching, ranked/casual, microphone/rank breakdown, wait bands, current rooms, playing/sessions, and the last five minutes of lifecycle activity. GROWTH contains total/new/DAU/returning users, D1/D3/D7, ranked/casual usage, rooms/sessions, median/P95 wait time, and reliable acquisition dimensions only. Synthetic accounts are excluded by their permanent synthetic marker.

Grafana’s first dashboard is `JIYUAN PRODUCTION`: app/container health, DB proxy/API traffic, matcher rate/outcome ratios, real SQL serialization failures distinct from business conflicts, realtime/presence errors, and storm status. A missing query result is represented as `NO DATA`, never as zero. Alert rules cover sustained CPU, 5xx/timeout spikes, SQL 40001 spikes, matcher conflict spikes, and container restart/OOM.

## Verification and rollout

1. Unit/contract tests cover authorization, resolver truth, auditor records, preview/no-mutation behavior, normal matching routing, synthetic exclusion, metrics serialization, and no-data semantics.
2. Start local Metabase, Prometheus, and Grafana through the local Compose project; verify they are only locally reachable.
3. Deploy the lightweight `/ops` pages and run synthetic smoke: live counts, user/room resolver, contact state, ranked preview/force match, casual attach/lock, and terminal convergence.
4. Verify local Metabase and Grafana dashboards with synthetic traffic; ensure synthetic accounts do not enter growth totals.
5. Deploy only after smoke reports zero new duplicate, ghost, and active residue.
6. Retire the legacy `/ops` implementation only after the new lightweight `/ops`, Metabase, and Grafana are ready; until then it is an explicitly labelled fallback.

## Non-goals

- No new matching state machine or shadow Room/Ticket model.
- No automatic database cleanup, state repair, or destructive admin action.
- No arbitrary SQL from `/ops` or a dashboard.
- No Appsmith deployment.
- No public dashboard endpoint, public registration, or browser-held production secret.
- No inferred school/channel attribution from usernames or IP addresses.
