-- Cover reverse foreign-key lookups used by member exit, settlement, and
-- profile lifecycle operations. This migration does not rewrite business data.

create index if not exists room_recruitment_votes_user_id_idx
  on public.room_recruitment_votes(user_id);

create index if not exists session_participant_settlements_user_id_idx
  on public.session_participant_settlements(user_id);

create index if not exists room_state_events_actor_id_idx
  on public.room_state_events(actor_id)
  where actor_id is not null;
