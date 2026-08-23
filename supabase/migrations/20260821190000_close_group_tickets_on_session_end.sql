-- Keep casual groups and their tickets in lockstep with the linked Session.
-- Without this, a completed group Session leaves `playing` group tickets
-- behind; the next matchmaking start then reuses the old group and reopens
-- the previous matching screen.

create or replace function public.matchmaking_sync_session_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
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

  update public.matchmaking_pairs
  set state = v_target,
      playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
      completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
      closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
      cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
      updated_at = now(),
      version = version + 1
  where session_id = new.id and state <> v_target;

  update public.matchmaking_tickets
  set state = v_target,
      playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
      completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
      closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
      cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
      updated_at = now(),
      version = version + 1
  where pair_id in (select id from public.matchmaking_pairs where session_id = new.id)
    and state <> v_target;

  update public.matchmaking_groups
  set state = v_target,
      closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
      cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
      updated_at = now(),
      version = version + 1
  where session_id = new.id and state <> v_target;

  update public.matchmaking_tickets
  set state = v_target,
      playing_at = case when v_target = 'playing' then coalesce(playing_at, now()) else playing_at end,
      completed_at = case when v_target = 'completed' then coalesce(completed_at, now()) else completed_at end,
      closed_at = case when v_target in ('completed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
      cancel_reason = case when v_target = 'cancelled' then coalesce(cancel_reason, new.completion_reason, 'session_cancelled') else cancel_reason end,
      updated_at = now(),
      version = version + 1
  where group_id in (select id from public.matchmaking_groups where session_id = new.id)
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

revoke all on function public.matchmaking_sync_session_lifecycle() from public, anon, authenticated;
grant execute on function public.matchmaking_sync_session_lifecycle() to service_role;

-- Repair group/ticket rows left behind by earlier completed Sessions.
update public.matchmaking_groups g
set state = case s.status when 'completed' then 'completed' else 'cancelled' end,
    closed_at = coalesce(g.closed_at, s.ended_at, now()),
    cancel_reason = case when s.status = 'cancelled' then coalesce(g.cancel_reason, s.completion_reason, 'session_cancelled') else g.cancel_reason end,
    updated_at = now(),
    version = g.version + 1
from public.sessions s
where g.session_id = s.id
  and s.status in ('completed', 'cancelled')
  and g.state in ('matched', 'playing');

update public.matchmaking_tickets t
set state = case s.status when 'completed' then 'completed' else 'cancelled' end,
    completed_at = case when s.status = 'completed' then coalesce(t.completed_at, s.ended_at, now()) else t.completed_at end,
    closed_at = coalesce(t.closed_at, s.ended_at, now()),
    cancel_reason = case when s.status = 'cancelled' then coalesce(t.cancel_reason, s.completion_reason, 'session_cancelled') else t.cancel_reason end,
    updated_at = now(),
    version = t.version + 1
from public.matchmaking_groups g
join public.sessions s on s.id = g.session_id
where t.group_id = g.id
  and s.status in ('completed', 'cancelled')
  and t.state in ('matched', 'playing');
