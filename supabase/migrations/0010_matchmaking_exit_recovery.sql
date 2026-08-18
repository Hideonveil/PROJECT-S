-- Close a two-player matchmaking Session as soon as either member explicitly exits.
-- This releases both active tickets and prevents the remaining player from being
-- sent through the retired matching flow.
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
  set status = 'exited', exited_at = coalesce(exited_at, now())
  where room_id = v_session.room_id and user_id = p_actor_id;

  if v_session.status = 'ready' then
    update public.sessions
    set status = 'cancelled', ended_at = coalesce(ended_at, now()),
        completion_reason = 'member_exited', completed_by = p_actor_id,
        version = version + 1
    where id = v_session.id
    returning * into v_session;

    update public.rooms
    set status = 'cancelled', completed_at = coalesce(completed_at, v_session.ended_at)
    where id = v_session.room_id;

    update public.match_requests
    set status = 'cancelled'
    where user_id in (
      select rm.user_id from public.room_members rm where rm.room_id = v_session.room_id
    ) and status in ('matching', 'matched');
  elsif v_session.status = 'playing' then
    return public.phase1_finalize_session(
      v_session.id, p_actor_id, 'member_exited', p_request_id
    );
  end if;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.phase1_exit_room(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.phase1_exit_room(uuid, uuid, text) to service_role;

-- Repair connected tickets left active by an already-terminal Session before
-- this migration was installed. No user or history rows are deleted.
update public.matchmaking_pairs mp
set state = case s.status when 'completed' then 'completed' else 'cancelled' end,
    completed_at = case when s.status = 'completed' then coalesce(mp.completed_at, s.ended_at, now()) else mp.completed_at end,
    cancel_reason = case when s.status = 'cancelled' then coalesce(mp.cancel_reason, s.completion_reason, 'session_cancelled') else mp.cancel_reason end,
    updated_at = now(), version = mp.version + 1
from public.sessions s
where mp.session_id = s.id
  and s.status in ('completed', 'cancelled')
  and mp.state in ('matched', 'playing');

update public.matchmaking_tickets mt
set state = mp.state,
    completed_at = case when mp.state = 'completed' then coalesce(mt.completed_at, mp.completed_at, now()) else mt.completed_at end,
    closed_at = coalesce(mt.closed_at, now()),
    cancel_reason = case when mp.state = 'cancelled' then coalesce(mt.cancel_reason, mp.cancel_reason, 'session_cancelled') else mt.cancel_reason end,
    updated_at = now(), version = mt.version + 1
from public.matchmaking_pairs mp
where mt.pair_id = mp.id
  and mp.state in ('completed', 'cancelled')
  and mt.state in ('matched', 'playing');
