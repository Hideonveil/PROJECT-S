# JIYUAN OPS V2 — Local Appsmith artifact

This document is the import companion for the local Appsmith application. It is
designed for a founder-only Appsmith instance bound to localhost and connected
to the protected Jiyuan OPS V2 REST API through an SSH tunnel.

## Pages

- `LIVE` — current online, matching, mode, waiting-room, session, and recent activity facts.
- `USERS` — searchable User Inspector lifecycle rows.
- `ROOMS` — Room Inspector with lifecycle and anomaly flags.
- `CONTACTS` — contact queue with unread/read/resolved handling.
- `MANUAL MATCH` — preview-first Ranked and Casual interventions.

## Datasource binding

Import `import/datasource.json` as a REST datasource. Set `baseUrl` to the
local tunnel address and bind `x-jiyuan-ops-key` from the Appsmith server-side
environment binding. Do not paste a key, database credential, or user token
into a page, query, widget, or exported artifact.

All reads use the protected `/api/internal/ops-v2` REST endpoints. **No direct database datasource** is permitted.

## Page wiring

| Page | Read endpoint | User action |
| --- | --- | --- |
| LIVE | `/live` | refresh only |
| USERS | `/users` and `/users/:userId` | inspect lifecycle |
| ROOMS | `/rooms` | inspect anomalies |
| CONTACTS | `/contacts` | PATCH contact status |
| MANUAL MATCH | preview endpoints | Preview before Force; then audited mutation |

## Manual Match safety

Every operation requires an operator reason and a fresh preview. Ranked uses
`/ranked/preview` then `ADMIN_FORCE_RANKED_MATCH`. Casual uses
`/casual/preview-attach`, then `ADMIN_ATTACH_CASUAL_USER`; locking uses the
normal `/casual/lock` path and `ADMIN_LOCK_CASUAL_ROOM`. The API performs the
current matching-domain checks, calls the normal lifecycle RPCs, and writes an
audit record. Appsmith never inserts or updates pair, room, session, or member
rows directly.

## Local-only operation

Keep Appsmith and the SSH tunnel on the founder Mac. Do not publish the
Appsmith port or the protected API. A failed read must render an error state,
not an empty or zero-valued dashboard.
