-- Forward-only schema reconciliation for indexes already present in Production.
-- This migration records the Production schema as observed on 2026-08-25.
-- It is intentionally idempotent because the canonical Production objects predate
-- this repository migration; it must not be used to replay or repair migration history.

create unique index if not exists matchmaking_pairs_active_unordered_unique
  on public.matchmaking_pairs using btree (
    least(ticket_a_id, ticket_b_id),
    greatest(ticket_a_id, ticket_b_id)
  )
  where state in ('candidate_found', 'waiting_confirmation', 'matched', 'playing');

create index if not exists matchmaking_confirmations_user_id_idx
  on public.matchmaking_confirmations using btree (user_id);

create index if not exists matchmaking_feedback_user_id_idx
  on public.matchmaking_feedback using btree (user_id);

create index if not exists matchmaking_groups_room_id_idx
  on public.matchmaking_groups using btree (room_id);

create index if not exists matchmaking_groups_rule_set_id_idx
  on public.matchmaking_groups using btree (rule_set_id);

create index if not exists matchmaking_groups_session_id_idx
  on public.matchmaking_groups using btree (session_id);

create index if not exists matchmaking_pairs_rule_set_id_idx
  on public.matchmaking_pairs using btree (rule_set_id);

create index if not exists matchmaking_pairs_ticket_a_id_idx
  on public.matchmaking_pairs using btree (ticket_a_id);

create index if not exists matchmaking_pairs_ticket_b_id_idx
  on public.matchmaking_pairs using btree (ticket_b_id);

create index if not exists matchmaking_state_events_actor_user_id_idx
  on public.matchmaking_state_events using btree (actor_user_id);

create index if not exists matchmaking_tickets_group_id_idx
  on public.matchmaking_tickets using btree (group_id);

create index if not exists matchmaking_tickets_pair_id_idx
  on public.matchmaking_tickets using btree (pair_id);

create index if not exists matchmaking_tickets_rule_set_id_idx
  on public.matchmaking_tickets using btree (rule_set_id);
