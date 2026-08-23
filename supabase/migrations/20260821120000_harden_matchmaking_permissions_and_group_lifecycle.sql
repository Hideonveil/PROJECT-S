-- Harden the public surface of matchmaking RPCs and close the casual
-- group/session lifecycle gap. This migration is intentionally additive:
-- API routes continue to use service_role, while direct browser RPC access is
-- removed and a fully-confirmed casual group starts its linked session in the
-- same transaction.

-- ---------------------------------------------------------------------------
-- Internal matchmaking RPCs must never be callable by an end-user role.
-- ---------------------------------------------------------------------------
revoke all on function public.matchmaking_ensure_group(uuid) from public, anon, authenticated;
revoke all on function public.matchmaking_reserve_group_member(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.matchmaking_start_group(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.matchmaking_confirm_group(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.matchmaking_cancel_group(uuid, text, text) from public, anon, authenticated;
revoke all on function public.matchmaking_expire_group_stale() from public, anon, authenticated;

grant execute on function public.matchmaking_ensure_group(uuid) to service_role;
grant execute on function public.matchmaking_reserve_group_member(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.matchmaking_start_group(uuid, uuid, text) to service_role;
grant execute on function public.matchmaking_confirm_group(uuid, uuid, text, text) to service_role;
grant execute on function public.matchmaking_cancel_group(uuid, text, text) to service_role;
grant execute on function public.matchmaking_expire_group_stale() to service_role;

-- ---------------------------------------------------------------------------
-- A fully-confirmed casual group creates a ready session, but the group RPC
-- returns before any client-side start call exists. A deferred trigger runs
-- after the RPC has finished writing matched tickets, starts the linked
-- session through the canonical Phase 1 transition, and then moves the group
-- and all of its tickets to playing. Deferring the trigger is important: the
-- confirm function writes ticket rows after it writes the group row, so an
-- immediate trigger would otherwise be overwritten back to matched.
-- ---------------------------------------------------------------------------
create or replace function public.matchmaking_start_group_session()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.session_id is null or new.state <> 'matched' or old.state = new.state then
    return new;
  end if;

  perform public.phase1_start_session(new.session_id, new.owner_user_id, null);

  update public.matchmaking_groups
  set state = 'playing', updated_at = now(), version = version + 1
  where id = new.id and state = 'matched';

  update public.matchmaking_tickets
  set state = 'playing', playing_at = coalesce(playing_at, now()),
      updated_at = now(), version = version + 1
  where group_id = new.id and state = 'matched';

  return new;
end;
$$;

drop trigger if exists matchmaking_group_session_start_trigger on public.matchmaking_groups;
create constraint trigger matchmaking_group_session_start_trigger
  after update of session_id, state on public.matchmaking_groups
  deferrable initially deferred
  for each row
  when (new.session_id is not null and new.state = 'matched'
    and old.state is distinct from new.state)
  execute function public.matchmaking_start_group_session();

revoke all on function public.matchmaking_start_group_session() from public, anon, authenticated;
grant execute on function public.matchmaking_start_group_session() to service_role;

-- ---------------------------------------------------------------------------
-- The legacy policies exposed matchmaking input rows and allowed either party
-- to rewrite an entire application. All application writes go through the
-- service-role API, so authenticated clients receive no direct update path.
-- ---------------------------------------------------------------------------
drop policy if exists "user_games_select" on public.user_games;
drop policy if exists "user_games_select_own" on public.user_games;
create policy "user_games_select_own" on public.user_games
  for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists "match_requests_select" on public.match_requests;
drop policy if exists "match_requests_select_own" on public.match_requests;
create policy "match_requests_select_own" on public.match_requests
  for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists "applications_update_involved" on public.applications;
drop policy if exists "applications_update_recipient_status" on public.applications;

-- ---------------------------------------------------------------------------
-- Presence reads use a TTL in the application layer; this index keeps the
-- corresponding database filter bounded as the profile table grows.
-- ---------------------------------------------------------------------------
create index if not exists profiles_online_last_seen_idx
  on public.profiles (online, last_seen);
