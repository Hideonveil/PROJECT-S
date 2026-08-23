-- Canonical Room/Session terminal-state synchronization.
--
-- A terminal Session owns the terminal state of its Room. This migration does
-- not backfill, delete, or otherwise mutate historical ghost Rooms.

begin;

create or replace function public.matchmaking_sync_session_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
  v_room_id uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  v_target := case new.status
    when 'playing' then 'playing'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else null
  end;
  if v_target is null then
    return new;
  end if;

  -- Terminal Session states close a non-terminal Room in the same transaction.
  -- Legacy terminal Room states are preserved; no historical backfill occurs.
  if v_target in ('completed', 'cancelled') then
    v_room_id := new.room_id;

    if v_room_id is null then
      select r.id
        into v_room_id
        from public.rooms r
       where r.code = new.room_code
       limit 1;
    end if;

    if v_room_id is not null then
      update public.rooms
         set status = v_target,
             completed_at = coalesce(completed_at, new.ended_at, now())
       where id = v_room_id
         and status in ('connecting', 'ready', 'playing');
    end if;
  end if;

  update public.matchmaking_pairs
     set state = v_target,
         playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
         completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
         closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
         cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
         updated_at = now(),
         version = version + 1
   where session_id = new.id
     and state <> v_target;

  update public.matchmaking_tickets
     set state = v_target,
         playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
         completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
         closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
         cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
         updated_at = now(),
         version = version + 1
   where pair_id in (
     select id from public.matchmaking_pairs where session_id = new.id
   )
     and state <> v_target;

  update public.matchmaking_groups
     set state = v_target,
         closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
         cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
         updated_at = now(),
         version = version + 1
   where session_id = new.id
     and state <> v_target;

  update public.matchmaking_tickets
     set state = v_target,
         playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
         completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
         closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
         cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
         updated_at = now(),
         version = version + 1
   where group_id in (
     select id from public.matchmaking_groups where session_id = new.id
   )
     and state <> v_target;

  perform public.matchmaking_log_transition(
    null,
    (select id from public.matchmaking_pairs where session_id = new.id),
    new.completed_by,
    old.status,
    v_target,
    'session_sync'
  );

  return new;
end;
$$;

revoke all on function public.matchmaking_sync_session_lifecycle()
  from public, anon, authenticated;
grant execute on function public.matchmaking_sync_session_lifecycle()
  to service_role;

-- Room terminal state is now owned by the Session lifecycle trigger.
create or replace function public.phase1_finalize_session(
  p_session_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_game_id text;
  v_inserted integer := 0;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  if v_session.status = 'completed' then
    return to_jsonb(v_session);
  end if;
  if v_session.status <> 'playing' then
    raise exception using errcode = 'P0001', message = 'SESSION_STATE_CONFLICT';
  end if;

  update public.sessions
     set status = 'completed',
         ended_at = now(),
         completed_by = p_actor_id,
         completion_reason = p_reason,
         version = version + 1
   where id = v_session.id
   returning * into v_session;

  update public.match_requests
     set status = 'completed'
   where user_id in (
     select rm.user_id from public.room_members rm where rm.room_id = v_session.room_id
   )
     and status in ('matching', 'matched', 'playing');

  v_game_id := nullif(v_session.need ->> 'game', '');
  if v_game_id is not null and exists (select 1 from public.games where id = v_game_id) then
    insert into public.recent_connections (
      user_id, friend_id, game_id, room_id, session_id, played_at, play_count
    )
    select
      a.user_id, b.user_id, v_game_id, v_session.room_id, v_session.id,
      v_session.ended_at, 1
    from public.room_members a
    join public.room_members b
      on b.room_id = a.room_id and b.user_id <> a.user_id
    where a.room_id = v_session.room_id
    on conflict (session_id, user_id, friend_id) where session_id is not null do nothing;
    get diagnostics v_inserted = row_count;
  end if;

  perform public.phase1_log_event(
    'session_completed', p_actor_id, v_session.id, v_session.room_id,
    null, p_request_id, jsonb_build_object('reason', p_reason)
  );
  if v_inserted > 0 then
    perform public.phase1_log_event(
      'recent_connection_created', p_actor_id, v_session.id, v_session.room_id,
      null, p_request_id, jsonb_build_object('rows', v_inserted)
    );
  end if;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.phase1_finalize_session(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.phase1_finalize_session(uuid, uuid, text, text)
  to service_role;

-- Room terminal state is now owned by the Session lifecycle trigger.
create or replace function public.phase1_exit_room(
  p_session_id uuid,
  p_actor_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  update public.room_members
     set status = 'exited',
         exited_at = coalesce(exited_at, now())
   where room_id = v_session.room_id
     and user_id = p_actor_id;

  if v_session.status in ('ready', 'playing') then
    update public.sessions
       set status = 'cancelled',
           ended_at = coalesce(ended_at, now()),
           completion_reason = 'member_exited',
           completed_by = p_actor_id,
           version = version + 1
     where id = v_session.id
     returning * into v_session;
  end if;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.phase1_exit_room(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.phase1_exit_room(uuid, uuid, text)
  to service_role;

drop trigger if exists matchmaking_session_lifecycle_trigger on public.sessions;
create trigger matchmaking_session_lifecycle_trigger
after update of status on public.sessions
for each row
execute function public.matchmaking_sync_session_lifecycle();

commit;
