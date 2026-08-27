-- Room-first Sessions are created in `ready` and can remain there while the
-- players use the Room. Goodbye is a valid terminal action from both `ready`
-- and `playing`; treating `ready` as a database error made every Ranked
-- Room-first Goodbye fail before it could record the member's intent.

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
  if v_session.status not in ('ready', 'playing') then
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

create or replace function public.phase1_request_goodbye(
  p_session_id uuid,
  p_actor_id uuid,
  p_requested boolean,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_active_count integer;
  v_request_count integer;
  v_result jsonb;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  if v_session.status = 'completed' and v_session.completion_reason = 'mutual_goodbye' then
    return to_jsonb(v_session) || jsonb_build_object('completed', true, 'reused', true);
  end if;

  if v_session.status not in ('ready', 'playing') then
    raise exception using errcode = 'P0001', message = 'SESSION_NOT_PLAYING';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = v_session.room_id and user_id = p_actor_id and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'SESSION_MEMBER_INACTIVE';
  end if;

  if p_requested then
    insert into public.session_goodbye_requests (session_id, user_id)
    values (v_session.id, p_actor_id)
    on conflict (session_id, user_id) do update
      set updated_at = now();
  else
    delete from public.session_goodbye_requests
    where session_id = v_session.id and user_id = p_actor_id;
  end if;

  select count(*) into v_active_count
  from public.room_members
  where room_id = v_session.room_id and status = 'active';

  select count(*) into v_request_count
  from public.session_goodbye_requests g
  join public.room_members rm
    on rm.room_id = v_session.room_id
   and rm.user_id = g.user_id
   and rm.status = 'active'
  where g.session_id = v_session.id;

  if p_requested and v_active_count > 1 and v_request_count = v_active_count then
    v_result := public.phase1_complete_session(
      v_session.id, p_actor_id, 'mutual_goodbye', p_request_id
    );
    return v_result || jsonb_build_object(
      'completed', true,
      'requestCount', v_request_count,
      'activeCount', v_active_count
    );
  end if;

  return to_jsonb(v_session) || jsonb_build_object(
    'completed', false,
    'requested', p_requested,
    'requestCount', v_request_count,
    'activeCount', v_active_count
  );
end;
$$;

revoke all on function public.phase1_finalize_session(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.phase1_finalize_session(uuid, uuid, text, text)
  to service_role;

revoke all on function public.phase1_request_goodbye(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.phase1_request_goodbye(uuid, uuid, boolean, text)
  to service_role;
