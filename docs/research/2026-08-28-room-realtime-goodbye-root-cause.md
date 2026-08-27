# Room roster and Goodbye reliability investigation

Date: 2026-08-28

## Scope

Read-only investigation of three Production symptoms:

1. One matched player sees the other player while the peer remains on a stale one-player Room.
2. After both players request Goodbye, the first requester can remain in the Room until clicking again.
3. Goodbye sometimes returns the generic “拜拜出问题” error.

No Production code or data was changed during this investigation.

## Findings

### 1. Room membership is authoritative in PostgreSQL, but client convergence depends on a best-effort signal

The current client opens one broad `node-events` Postgres Changes channel. A `room_members` event asks the browser to fetch an authoritative Room snapshot. Polling is enabled only after an explicit channel error. A channel that remains `SUBSCRIBED` but misses or delays a relevant event has no bounded Room-state watchdog.

The Room-first endpoint deliberately returns a one-member shell and hydrates the full roster later. This creates a race: a match can commit near shell navigation, while the corresponding event is ignored because the browser is not yet on the Room route; if the subsequent hydration happens before the match commit, the client can remain on the one-member snapshot until another mutation causes a fresh read. “停止招募” is such a mutation, which explains why the missing peer appears after that action.

### 2. Goodbye completion is correct in the database transaction, but the first client has no reliable completion catch-up

The first Goodbye request is supposed to remain in the Room while waiting for the other active member. The final request atomically completes the Session. The last requester learns the result from the HTTP response; the first requester depends on a Session/Goodbye Realtime event followed by `/api/state` reconciliation. If that notification or refresh is missed/delayed, clicking Goodbye again performs another authoritative read/mutation and finally exposes the already-completed state.

### 3. Ranked Room-first creates a `ready` Session, while Goodbye only accepts `playing`

The current Ranked pair reservation creates a Session with `status = 'ready'`. `phase1_request_goodbye()` rejects every status other than `playing` with `SESSION_NOT_PLAYING`. The API error map does not include `SESSION_NOT_PLAYING` (or `SESSION_MEMBER_INACTIVE`), so this domain-state mismatch becomes HTTP 500 `INTERNAL_ERROR` and the UI displays the generic Goodbye failure.

This is consistent with the recent 30-user run: every authenticated test user reached a Ranked Room, but all observed Goodbye calls returned HTTP 500. Production application logs contain the corresponding `action=goodbye`, `code=INTERNAL_ERROR`, `error_name=UnknownError` records.

Separate PostgreSQL `invalid input syntax for type json` entries were observed in nearby windows, but the current application logger discards Supabase error code/message/detail/hint. They cannot yet be causally assigned to the same Goodbye requests from existing logs. The logger must preserve structured database error fields before that secondary error can be attributed safely.

## Root-cause classification

- Asymmetric roster: client reconciliation design gap, amplified by Room-shell timing; not evidence that matching failed.
- First requester stuck after mutual Goodbye: Realtime-only completion handoff without bounded authoritative catch-up.
- Goodbye error: confirmed Ranked Session state-contract mismatch (`ready` versus `playing`) plus error-classification/observability loss.

## Mature pattern to adopt

1. Treat PostgreSQL/API Room projection as the source of truth; Realtime is a wake-up hint.
2. Publish room-scoped events carrying `{room_id, version, kind}` and keep a monotonic Room aggregate version.
3. Subscribe first, then fetch the snapshot; fetch again on reconnect, visibility return, version gaps, and a bounded active-Room watchdog.
4. Apply only snapshots whose version is not older than local state.
5. Model Goodbye as one idempotent command per `(session_id, user_id)` and return the authoritative Session projection on every response, including an already-completed result.
6. After a local Goodbye is accepted, reconcile until the Session becomes terminal or the server explicitly reports that another member is still pending.
7. Use typed domain outcomes (`SESSION_READY`, `WAITING_FOR_PEER`, `SESSION_COMPLETED`) rather than converting expected state into HTTP 500.
8. Add a real two-browser integration test against Supabase, including intentionally dropped/delayed Realtime events. Mock-only tests cannot validate this failure class.

## Primary references

- Supabase recommends Broadcast over Postgres Changes for scalability and security and supports trigger-driven private-channel broadcasts: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase documents that `SUBSCRIBED` can still precede replication readiness and a write in that gap can be missed: https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting
- Supabase documents silent WebSocket disconnections and heartbeat/reconnect handling: https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
- PostgreSQL documents that notifications are delivered only after transaction commit: https://www.postgresql.org/docs/current/sql-notify.html
- Stripe documents idempotency keys for safely reconciling uncertain POST mutations: https://docs.stripe.com/api/idempotent_requests
- Amazon GameLift FlexMatch exposes explicit matchmaking/ticket states and requires clients to retrieve authoritative ticket/session information after state transitions: https://docs.aws.amazon.com/gamelift/latest/apireference/API_AcceptMatch.html

