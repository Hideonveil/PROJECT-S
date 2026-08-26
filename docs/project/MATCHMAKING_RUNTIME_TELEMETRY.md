# Matchmaking runtime contract

This document is the engineering contract for the persistent Matcher. It is
separate from capacity evidence: a capacity run may consume this source, but
the runtime tables are the production fact source for Matcher health.

## Outcome classification

Normal candidate contention is a committed business outcome:

```text
MATCHING_BUSINESS_CONFLICT
  MATCH_RESERVATION_CONFLICT
  GROUP_RESERVATION_CONFLICT
  STALE_CANDIDATE
  TICKET_STATE_CHANGED
  GROUP_FULL
  ROOM_LOCKED

DATABASE_SERIALIZATION_FAILURE  SQLSTATE 40001 only when PostgreSQL emitted it
DATABASE_TIMEOUT                 SQLSTATE 57014 / timeout
DATABASE_CONNECTION_FAILURE     connection or transport failure
APPLICATION_ERROR                all other unexpected application failures
```

Business contention must never be raised as `40001`, `23505`, or `40P01`.
Those SQLSTATE values retain their PostgreSQL meaning. The Matcher does not
retry a business conflict as a database error.

## Scheduling and retry contract

Every persistent attempt has a durable `last_match_attempt_at`,
`next_match_attempt_at`, `last_match_outcome`, `last_match_target_id`, and
`consecutive_conflicts` state on the ticket. A ticket with no pool change is
skipped until its next eligible time. A new ticket or a real transition back
to `searching` clears the schedule through the wake trigger.

Every retry path must document:

- the trigger and typed outcome;
- a finite attempt budget;
- non-zero backoff with jitter;
- same-target suppression;
- the terminal outcome and telemetry counter.

The Matcher loop remains bounded, but only the database lease holder may scan
the pool. The lease is the cross-process single-flight boundary; the
process-local `matcherBusy` flag is only an optimization.

## Runtime source of truth

`matchmaking_runtime_minute` stores minute-level counters, gauges, and latency
sums/counts. `matchmaking_runtime_instances` records process/container,
heartbeat, leader, and ticks/tickets per minute. `matchmaking_runtime_events`
stores sampled successes and complete abnormal events. It never stores
passwords, access tokens, refresh tokens, Authorization headers, or service
role credentials.

The minimum operational ratios are:

```text
pair_attempts / pair_success
group_attempts / group_success
business_conflicts / attempts
matcher_retries / business_conflicts
actual_sql_40001 / attempts
unique_tickets_processed / tickets_processed
```

An operator must be able to identify a possible busy loop when one unchanged
ticket is processed repeatedly without a pool transition. Circuit breaking may
increase cooldown or pause new Matcher writes; it may not delete tickets,
rewrite lifecycle state, or clean historical residue.

## Review checklist

Before merging Matching code, reviewers must answer yes to all of these:

- Does normal contention return a typed business reason rather than a SQLSTATE?
- Is every retry finite, delayed, jittered, and observable?
- Can the same target be suppressed within the attempt budget?
- Does a no-change searching ticket receive a durable cooldown?
- Does a new candidate or state transition wake the ticket?
- Does the path distinguish business conflict, real `40001`, timeout, and app error?
- Does duplicate prevention remain enforced by the database?
- Does a restart preserve idempotency and avoid duplicate Room/Session creation?
- Are instance heartbeat and cross-process leader ownership observable?
- Are abnormal events free of secrets and user credentials?

