# Local Metabase collections

This directory defines the first two Metabase collections for Jiyuan:

- `JIYUAN LIVE`: current operational facts and a last-five-minute activity pulse.
- `JIYUAN GROWTH`: production-user growth, return, mode, room, session, and wait-time facts.

Metabase runs on the founder Mac only. Connect it to Production through an SSH
tunnel and a dedicated `analytics_readonly` PostgreSQL role. The database
endpoint must be bound to the tunnel's local address; no database port is
published publicly.

The SQL files are saved questions/templates, not migrations. They are
SELECT-only and must be imported into Metabase as native questions. A failed
query must be shown as `NO DATA`; it must not be converted to zero by a
dashboard expression.

## Collections

`live.sql` returns one row per LIVE metric: online users, matching users,
Ranked/Casual pool counts, microphone preference, rank presence, waiting bands,
current rooms, playing sessions, and activity in the last 5 minutes.

`growth.sql` returns one row per GROWTH metric: total users, new users, DAU,
returning users, D1/D3/D7 return cohorts, mode usage, rooms, sessions, and
median/P95 wait time. Acquisition dimensions are included only when reliable
`profiles.acquisition_*` columns exist in the deployed schema; this first
query does not infer school or channel from usernames or IP addresses.

## Synthetic account boundary

Both questions exclude users whose Auth metadata contains
`account_type=synthetic_test`. If the read-only role cannot read
`auth.users`, expose the same marker through a reviewed read-only view before
importing these questions; do not silently remove the exclusion.

## Local tunnel example

Use the existing private SSH access path and point Metabase at the local
forwarded PostgreSQL address. Keep database credentials in Metabase's local
secret store or untracked local configuration; never paste them into this
repository, dashboard cards, screenshots, or evidence.
