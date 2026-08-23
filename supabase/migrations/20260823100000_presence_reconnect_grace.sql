-- Presence heartbeat, effective-online TTL, and Room reconnect grace.
--
-- Presence is deliberately separate from Room membership. A stale profile
-- cancels only pre-room matching immediately; an active Room member keeps its
-- membership for 180 seconds before the existing Session/Room lifecycle is
-- settled through a system-timeout transition.

begin;

alter table public.room_members
  add column if not exists disconnected_at timestamptz null;

create index if not exists room_members_presence_disconnect_idx
  on public.room_members (disconnected_at, room_id)
  where status = 'active' and disconnected_at is not null;

create or replace function public.presence_guard_matchmaking_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Do not create a new Room for a profile whose last heartbeat is already
  -- outside the effective-online window. Once a Session exists, the Room
  -- reconnect-grace path owns disconnect handling instead.
  if new.state = 'matched' and old.state is distinct from new.state
     and not exists (
       select 1
         from public.profiles p
        where p.id = new.user_id
          and p.online = true
          and p.last_seen > now() - interval '30 seconds'
     ) then
    raise exception using errcode = 'P0001', message = 'MATCH_USER_OFFLINE';
  end if;
  return new;
end;
$$;

drop trigger if exists presence_guard_matchmaking_ticket on public.matchmaking_tickets;
create trigger presence_guard_matchmaking_ticket
before update of state on public.matchmaking_tickets
for each row execute function public.presence_guard_matchmaking_ticket();

create or replace function public.phase1_timeout_leave(
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
  select * into v_session
    from public.sessions
   where id = p_session_id
   for update;

  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  -- A concurrent explicit Leave, Goodbye completion, or previous timeout has
  -- already settled this Session. Returning the terminal row makes retries
  -- safe and prevents duplicate side effects.
  if v_session.status not in ('ready', 'playing') then
    return to_jsonb(v_session);
  end if;

  update public.room_members
     set status = 'exited',
         exited_at = coalesce(exited_at, now()),
         disconnected_at = null
   where room_id = v_session.room_id
     and user_id = p_actor_id
     and status = 'active';

  update public.sessions
     set status = 'cancelled',
         ended_at = coalesce(ended_at, now()),
         completed_by = null,
         completion_reason = 'system_timeout_leave',
         version = version + 1
   where id = v_session.id
   returning * into v_session;

  perform public.phase1_log_event(
    'session_cancelled',
    null,
    v_session.id,
    v_session.room_id,
    null,
    p_request_id,
    jsonb_build_object('reason', 'system_timeout_leave')
  );

  return to_jsonb(v_session);
end;
$$;

create or replace function public.presence_reconcile_stale(
  p_now timestamptz default now(),
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_ticket record;
  v_member record;
  v_request_id text;
  v_disconnect_at timestamptz;
  v_matching_cancelled integer := 0;
  v_disconnected_marked integer := 0;
  v_timeout_leaves integer := 0;
  v_errors integer := 0;
begin
  -- Lock the profile first. Heartbeat and reconciliation therefore have a
  -- deterministic race result: whichever obtains the profile lock first wins.
  for v_profile in
    select p.id, p.last_seen
      from public.profiles p
     where p.online is distinct from true
        or p.last_seen is null
        or p.last_seen <= p_now - interval '30 seconds'
     order by p.last_seen nulls first, p.id
     limit greatest(1, least(coalesce(p_limit, 200), 1000))
     for update skip locked
  loop
    v_request_id := format('presence:%s:%s', v_profile.id, to_char(p_now, 'YYYYMMDDHH24MISSMS'));

    -- Keep the compatibility boolean aligned with the authoritative TTL
    -- result. Consumers must still use effective presence, but stale users
    -- should not remain permanently marked online for legacy readers.
    update public.profiles
       set online = false
     where id = v_profile.id
       and online is distinct from false;

    -- Only pre-room tickets are cancelled here. Matched/playing tickets are
    -- governed by the linked Room/Session reconnect grace instead.
    for v_ticket in
      select t.mode, t.group_id
        from public.matchmaking_tickets t
       where t.user_id = v_profile.id
         and t.state in ('searching', 'candidate_found', 'waiting_confirmation')
       order by t.created_at desc
    loop
      begin
        if v_ticket.mode = 'casual' and v_ticket.group_id is not null then
          perform public.matchmaking_cancel_group(
            v_profile.id, 'presence_timeout', v_request_id
          );
        else
          perform public.matchmaking_cancel_ticket(
            v_profile.id, 'presence_timeout', v_request_id
          );
        end if;
        v_matching_cancelled := v_matching_cancelled + 1;
      exception when others then
        -- One malformed historical ticket must not prevent other stale users
        -- from being reconciled. The next bounded sweep retries it.
        v_errors := v_errors + 1;
      end;
    end loop;

    -- Mark active Room membership disconnected, but do not change membership
    -- or Session state until the 180-second reconnect grace has elapsed.
    for v_member in
      select rm.id, rm.room_id, rm.disconnected_at, s.id as session_id
        from public.room_members rm
        join public.sessions s on s.room_id = rm.room_id
       where rm.user_id = v_profile.id
         and rm.status = 'active'
         and s.status in ('ready', 'playing')
       order by rm.id
    loop
      if v_member.disconnected_at is null then
        -- Keep disconnected_at as an audit marker, but do not start a fresh
        -- 180-second clock here. The timeout clock is anchored to the last
        -- server heartbeat (or, for an explicit Logout, the offline hint).
        v_disconnect_at := p_now;
        update public.room_members
           set disconnected_at = v_disconnect_at
         where id = v_member.id
           and status = 'active'
           and disconnected_at is null;
        if coalesce(v_profile.last_seen, v_disconnect_at) <= p_now - interval '180 seconds' then
          begin
            perform public.phase1_timeout_leave(
              v_member.session_id,
              v_profile.id,
              v_request_id || ':timeout:' || v_member.id
            );
            v_timeout_leaves := v_timeout_leaves + 1;
          exception when others then
            v_errors := v_errors + 1;
          end;
        else
          v_disconnected_marked := v_disconnected_marked + 1;
        end if;
      elsif coalesce(v_profile.last_seen, v_member.disconnected_at) <= p_now - interval '180 seconds' then
        begin
          perform public.phase1_timeout_leave(
            v_member.session_id,
            v_profile.id,
            v_request_id || ':timeout:' || v_member.id
          );
          v_timeout_leaves := v_timeout_leaves + 1;
        exception when others then
          v_errors := v_errors + 1;
        end;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'matchingCancelled', v_matching_cancelled,
    'disconnectedMarked', v_disconnected_marked,
    'timeoutLeaves', v_timeout_leaves,
    'errors', v_errors
  );
end;
$$;

-- Presence timeout reconciliation must not depend on an OPS request or on a
-- surviving user's heartbeat. Require Supabase Cron and fail closed if the
-- managed module has not been enabled in the target project.
do $$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception using errcode = 'P0001', message = 'PRESENCE_CRON_REQUIRED';
  end if;

  execute $job$
    select cron.schedule(
      'jiyuan-presence-reconcile',
      '* * * * *',
      'select public.presence_reconcile_stale();'
    )
  $job$ into v_job_id;
end;
$$;

create or replace function public.presence_heartbeat(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_member record;
begin
  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  -- If no other request observed the disconnect, decide the timeout from the
  -- previous server-side heartbeat before accepting this reconnect. This
  -- prevents a user returning after the grace window from clearing a stale
  -- membership and accidentally reviving a timed-out Session.
  for v_member in
    select rm.id, rm.room_id, rm.disconnected_at, s.id as session_id
      from public.room_members rm
      join public.sessions s on s.room_id = rm.room_id
     where rm.user_id = p_user_id
       and rm.status = 'active'
       and s.status in ('ready', 'playing')
  loop
    if (
      v_profile.last_seen is not null
      and v_profile.last_seen <= p_now - interval '180 seconds'
    ) or (
      v_profile.last_seen is null
      and v_member.disconnected_at is not null
      and v_member.disconnected_at <= p_now - interval '180 seconds'
    ) then
      perform public.phase1_timeout_leave(
        v_member.session_id,
        p_user_id,
        format('presence:reconnect-timeout:%s:%s', p_user_id, v_member.id)
      );
    end if;
  end loop;

  update public.profiles
     set online = true,
         last_seen = p_now
   where id = p_user_id;

  -- For memberships that survive the timeout check above, reconnect wins
  -- before the stale sweep runs. Only live Room memberships are cleared;
  -- historical/terminal memberships remain untouched.
  update public.room_members rm
     set disconnected_at = null
   where rm.user_id = p_user_id
     and rm.status = 'active'
     and exists (
       select 1
         from public.sessions s
        where s.room_id = rm.room_id
          and s.status in ('ready', 'playing')
     );

  perform public.presence_reconcile_stale(p_now, 200);
  return jsonb_build_object('online', true, 'lastSeen', p_now);
end;
$$;

create or replace function public.presence_mark_offline(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('online', false, 'missing', true);
  end if;

  update public.profiles
     set online = false,
         last_seen = p_now
   where id = p_user_id;

  -- An explicit Logout starts the grace window now, rather than inheriting a
  -- potentially old heartbeat timestamp.
  update public.room_members rm
     set disconnected_at = p_now
   where rm.user_id = p_user_id
     and rm.status = 'active'
     and rm.disconnected_at is null
     and exists (
       select 1
         from public.sessions s
        where s.room_id = rm.room_id
          and s.status in ('ready', 'playing')
     );

  -- This only cancels pre-room matching and starts Room grace. It never calls
  -- phase1_exit_room, so Logout remains distinct from an explicit Leave.
  perform public.presence_reconcile_stale(p_now, 200);
  return jsonb_build_object('online', false, 'lastSeen', p_now);
end;
$$;

revoke all on function public.phase1_timeout_leave(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.presence_guard_matchmaking_ticket()
  from public, anon, authenticated;
revoke all on function public.presence_reconcile_stale(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.presence_heartbeat(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.presence_mark_offline(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.phase1_timeout_leave(uuid, uuid, text) to service_role;
grant execute on function public.presence_guard_matchmaking_ticket() to service_role;
grant execute on function public.presence_reconcile_stale(timestamptz, integer) to service_role;
grant execute on function public.presence_heartbeat(uuid, timestamptz) to service_role;
grant execute on function public.presence_mark_offline(uuid, timestamptz) to service_role;

commit;
