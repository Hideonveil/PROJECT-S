# capstate500-reuse-20260825 — Metrics Summary

Run window: `2026-08-25T05:31:09.928Z` → `2026-08-25T05:33:35.452Z` (UTC), 145.524 seconds.

## Database observability boundary

- Supabase Observability/Database page opened successfully, but CPU usage, Memory usage,
  Database Connections, network and disk charts all returned `Unable to load data` for this
  window.
- Therefore DB CPU baseline/peak/final, DB RAM, DB connections, exact DB rollback rate and
  exact database reserve-attempt counter are `NOT_OBTAINED`; the historical idle snapshot is
  not reused as stateful evidence.

## Available application and host evidence

- Pre-run `/api/health` at `2026-08-25T05:30:28.106Z`: `200 ready`, database and presence checks
  succeeded, `matching=3`, `playing=2`, database check duration `434ms`.
- Post-run `/api/health` at `2026-08-25T05:40:50.963Z`: `200 ready`, database and presence checks
  succeeded, `matching=3`, `playing=2`; no increase in those historical global counters.
- Remote app/gateway sampling showed no dangerous container-resource peak. App container peak
  observed was about `34.89% CPU` and `83.97MiB` during active requests, then returned to
  `0.00% CPU` / about `57.55MiB`; gateway remained below `1% CPU` in the sampled points and
  ended at `0.00% CPU` / `20.57MiB`. These are app/gateway metrics, not Supabase DB metrics.

## Runner and request evidence

- Lifecycle ledger: `125` entries; `122` HTTP `200`; `0` errors; `0` timeouts; `0` conflict
  errors; `0` rollback actions. The remaining three entries are non-HTTP lifecycle markers.
- `matchmaking.start`: `5/5` HTTP `200`, timeout `0`, max latency `6125.92ms`, average
  latency `5019.864ms`.
- Runner-observed matchmaking/group start calls: `6` over `145.524s`, a start-level proxy of
  about `2.47/min`; this is not the DB reserve-attempt counter.
- `MATCH_RESERVATION_CONFLICT=0`, `GROUP_RESERVATION_CONFLICT=0`, business rollback action
  count `0`; app log aggregation in the run window also found zero conflict/rollback/reserve/
  5xx-or-504 mentions.
- PostgREST/API runner responses observed: no `5xx`, `504`, or timeout. Health checks before and
  after remained successful.
- Realtime ledger: `14` `SUBSCRIBED`, `14` `CLOSED`, `0` errors; chat messages `4/4` reached all
  expected recipients.

## Lifecycle result

- Two rooms and two sessions reached `completed`; all five actors' final `/api/state` was empty.
- Read-only post-run DB inspection found `5` new `room_members` rows with `status=active` under
  those completed rooms. This is `NEW ACTIVE RESIDUE=5`; no SQL cleanup was performed.

Conclusion: functional runner stage `5=PASS`, but overall `5-USER STATEFUL=INCONCLUSIVE`;
`RESERVATION STORM FIX=NOT VERIFIED`; `10-USER READINESS=NOT READY`.
