# Production schema reconciliation manifest

Generated for P0 Phase 4. This is an audit artifact only. No production SQL,
deployment, migration repair, or data cleanup was performed.

## Read-only evidence captured on 2026-08-22

- `supabase_migrations.schema_migrations`: 8 rows, all listed below; the
  repository contains 27 pre-existing migrations plus the new non-production
  repair migration.
- Terminal invariant scan: 5 rows where a terminal Session is linked to a
  `playing` Room. All five have `Session.status = cancelled` and
  `completion_reason = member_exited`.
- Production trigger catalog: `matchmaking_session_lifecycle_trigger` is
  enabled on `public.sessions`; no Room trigger was present.
- Production Realtime publication: `public.sessions`, `public.rooms`,
  `public.messages`, `public.session_goodbye_requests`, and the matchmaking
  tables were present in `supabase_realtime`.
- Production RLS catalog: RLS was enabled on all nine inspected key tables:
  `rooms`, `room_members`, `sessions`, `messages`,
  `session_goodbye_requests`, `recent_connections`,
  `matchmaking_pairs`, `matchmaking_groups`, and `matchmaking_tickets`.
- Production function catalog: `phase1_exit_room` and
  `phase1_finalize_session` still directly update `public.rooms`; the current
  `matchmaking_sync_session_lifecycle` function does not. This is the exact
  pre-fix state that the new migration changes.

The catalog queries were read-only `SELECT` statements. No production row,
function, trigger, publication, policy, or migration-history entry was
changed.

## Status definitions

- `VERIFIED_APPLIED`: production history and required final objects/effects were verified.
- `SCHEMA_EQUIVALENT_HISTORY_MISSING`: required objects were observed in production, but the repository migration is not represented by the production history row.
- `SCHEMA_MISSING`: a required object was confirmed absent.
- `OBJECT_DRIFT`: the object exists but differs from the repository final definition.
- `DATA_EFFECT_UNVERIFIED`: schema/function evidence is incomplete or migration-time data effects were not proven.
- `OBSOLETE_OR_SUPERSEDED`: historical migration is superseded or has no current repository counterpart.

## Repository migration disposition

| Repository migration | Status | Production evidence / reason | Action |
|---|---|---|---|
| `0001_init.sql` | `DATA_EFFECT_UNVERIFIED` | Core tables exist, but baseline schema and seed data were not proven row-for-row. | Do not replay; compare against final schema baseline. |
| `0002_profiles_gender.sql` | `DATA_EFFECT_UNVERIFIED` | Column/default effect was not independently proven from the production catalog. | Verify column/default; repair with a new migration only if missing. |
| `0003_profiles_genres.sql` | `DATA_EFFECT_UNVERIFIED` | Column/default effect was not independently proven from the production catalog. | Verify column/default; repair with a new migration only if missing. |
| `0004_deadlock_genshin_match_details.sql` | `DATA_EFFECT_UNVERIFIED` | Contains game seed data and a column addition; seed equivalence was not proven. | Compare seed rows; do not replay blindly. |
| `0005_room_lifecycle.sql` | `DATA_EFFECT_UNVERIFIED` | Contains application backfill and uniqueness changes. | Do not replay; inspect backfill result and indexes. |
| `0006_phase1_mvp_closure.sql` | `DATA_EFFECT_UNVERIFIED` | Phase 1 functions and Room/Session objects exist, but historical backfills/deduplication were not proven. | Do not replay; compare final objects and data effects. |
| `0007_profiles_age_range.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production history contains `profiles_age_range` under a different timestamp version; final object identity still needs catalog capture. | Map only after catalog evidence. |
| `0008_restrict_auth_helpers.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production history contains `restrict_auth_helpers` under a different timestamp version. | Verify ACLs, then repair history or baseline. |
| `0009_realtime_matchmaking.sql` | `DATA_EFFECT_UNVERIFIED` | Matchmaking tables, functions, and Realtime subscriptions exist, but seed rules and all policies were not proven. | Do not replay; compare final schema/RLS/publication. |
| `0010_matchmaking_exit_recovery.sql` | `OBSOLETE_OR_SUPERSEDED` | Exit function was superseded by `0011_normal_and_abnormal_session_end.sql`. | Do not replay. |
| `0011_normal_and_abnormal_session_end.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production `phase1_exit_room` definition matches the repository intent; production history contains a timestamped equivalent name. | Verify exact catalog definition and map history. |
| `0012_restrict_internal_matchmaking_functions.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production history contains `restrict_internal_matchmaking_functions` under a different timestamp version. | Verify function ACLs, then map history. |
| `0013_p1_operations.sql` | `DATA_EFFECT_UNVERIFIED` | Operations function existence/effects were not fully captured. | Verify function body/ACL; do not replay until proven. |
| `0014_ops_dashboard.sql` | `DATA_EFFECT_UNVERIFIED` | Operations function existence/effects were not fully captured. | Verify function body/ACL; do not replay until proven. |
| `0015_ops_credentials.sql` | `DATA_EFFECT_UNVERIFIED` | Table/RLS/credential state was not fully captured. | Verify table, RLS, policy, and ACL. |
| `0016_casual_group_matchmaking.sql` | `DATA_EFFECT_UNVERIFIED` | Group schema and runtime functions exist, but full final schema/policy/publication parity was not proven. | Compare final schema; do not replay. |
| `20260818173534_mutual_goodbye_and_friend_requests.sql` | `VERIFIED_APPLIED` | Exact version/name is present in production history; production goodbye function/table existed. | Keep as historical applied evidence; still compare final body/ACL. |
| `20260819193000_feedback_limit.sql` | `DATA_EFFECT_UNVERIFIED` | Feedback constraint/policy effect was not independently captured. | Verify constraint/policy before history repair. |
| `20260820100000_deadlock_ranked_duo_only.sql` | `DATA_EFFECT_UNVERIFIED` | Contains a ruleset data update; final ruleset row was not proven. | Compare ruleset JSON; do not replay blindly. |
| `20260821120000_harden_matchmaking_permissions_and_group_lifecycle.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production group-session trigger and internal function signatures exist; history row is absent. | Verify exact trigger/ACL/policy definitions, then map. |
| `20260821150000_username_email_auth.sql` | `DATA_EFFECT_UNVERIFIED` | Username column/index was not independently captured from production. | Verify column/index/comment. |
| `20260821170000_reconcile_ghost_matchmaking.sql` | `DATA_EFFECT_UNVERIFIED` | Reconciliation functions/triggers exist, but migration-time data repair effect was not proven. | Verify function/trigger and terminal ticket data; do not replay. |
| `20260821190000_close_group_tickets_on_session_end.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production Session lifecycle trigger and function body were verified; history row is absent. | Verify exact final definition, then map or baseline. |
| `20260821200000_deadlock_rank_distance.sql` | `DATA_EFFECT_UNVERIFIED` | Contains a ruleset data update; final ruleset row was not proven. | Compare ruleset JSON; do not replay blindly. |
| `20260822090000_casual_team_range_intersection.sql` | `DATA_EFFECT_UNVERIFIED` | Contains group/ticket data transitions and function changes; full final effect was not proven. | Compare final group functions and data; do not replay. |
| `20260822170000_explicit_exit_lifecycle.sql` | `DATA_EFFECT_UNVERIFIED` | Production no-op expiry functions and explicit lifecycle triggers were verified, but infinity-field data effect was not proven. | Compare final data and trigger/ACL definitions. |
| `20260822183000_casual_group_start_with_two.sql` | `SCHEMA_EQUIVALENT_HISTORY_MISSING` | Production `matchmaking_start_group` body matched the two-player-start logic; history row is absent. | Verify exact definition, then map or baseline. |
| `20260822210000_sync_room_with_terminal_session.sql` | `SCHEMA_MISSING` | New non-production migration only; not applied to production. | Apply only after review and staging verification. |

## Production history observed previously

The production `supabase_migrations.schema_migrations` table contained eight
rows. Several names correspond semantically to repository migrations but use
different version identifiers:

| Production version | Production name | Repository mapping |
|---|---|---|
| `20260815110607` | `phase1_mvp_closure` | `0006_phase1_mvp_closure.sql` |
| `20260816102838` | `backup_operational_data_before_cleanup_20260816` | no current repository counterpart |
| `20260816103015` | `profiles_age_range` | `0007_profiles_age_range.sql` |
| `20260816103108` | `restrict_auth_helpers` | `0008_restrict_auth_helpers.sql` |
| `20260816105004` | `drop_verified_launch_backup_20260816` | no current repository counterpart |
| `20260818152837` | `normal_and_abnormal_session_end` | `0011_normal_and_abnormal_session_end.sql` |
| `20260818153101` | `restrict_internal_matchmaking_functions` | `0012_restrict_internal_matchmaking_functions.sql` |
| `20260818173534` | `mutual_goodbye_and_friend_requests` | exact repository filename/version |

## Current conclusion

No `SCHEMA_MISSING` item has been confirmed for the pre-existing production
objects, but multiple migrations remain `DATA_EFFECT_UNVERIFIED`. The correct
next action is catalog/data comparison, not replaying the missing migrations.

If final-state equivalence is proven, use the Supabase migration history repair
workflow to repair tracking only. If equivalence cannot be proven, keep the
item unresolved and create a new forward-only repair migration only for the
confirmed gap.
