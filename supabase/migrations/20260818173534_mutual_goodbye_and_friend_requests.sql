-- Mutual room closure and confirmable PROJECT-S friendships.
-- The browser can observe these rows through RLS, but all state changes are
-- performed by service-role RPCs so simultaneous actions remain atomic.

create table public.session_goodbye_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index session_goodbye_requests_user_idx
  on public.session_goodbye_requests (user_id, updated_at desc);

alter table public.session_goodbye_requests enable row level security;

create policy "session_goodbye_requests_read_session_member"
  on public.session_goodbye_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.players ? public.current_profile_id()::text
    )
  );

-- Earlier schema versions allowed a signed-in browser to mutate its own
-- directed friendship row. Requests now go through the transaction RPCs.
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_participant"
  on public.friendships
  for select to authenticated
  using (
    user_id = public.current_profile_id()
    or friend_id = public.current_profile_id()
  );

drop policy if exists "friendships_insert_own" on public.friendships;
drop policy if exists "friendships_update_own" on public.friendships;
drop policy if exists "friendships_delete_own" on public.friendships;

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

  if v_session.status <> 'playing' then
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

create or replace function public.phase1_request_friendship(
  p_actor_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forward public.friendships%rowtype;
  v_reverse public.friendships%rowtype;
begin
  if p_actor_id = p_target_id then
    raise exception using errcode = '22023', message = 'FRIEND_SELF_FORBIDDEN';
  end if;

  perform 1 from public.profiles
  where id in (p_actor_id, p_target_id)
  order by id
  for update;

  if (select count(*) from public.profiles where id in (p_actor_id, p_target_id)) <> 2 then
    raise exception using errcode = 'P0002', message = 'FRIEND_PROFILE_NOT_FOUND';
  end if;

  perform 1 from public.friendships
  where (user_id = p_actor_id and friend_id = p_target_id)
     or (user_id = p_target_id and friend_id = p_actor_id)
  order by user_id, friend_id
  for update;

  select * into v_forward from public.friendships
  where user_id = p_actor_id and friend_id = p_target_id;
  select * into v_reverse from public.friendships
  where user_id = p_target_id and friend_id = p_actor_id;

  if v_forward.status = 'blocked' or v_reverse.status = 'blocked' then
    raise exception using errcode = '42501', message = 'FRIEND_BLOCKED';
  end if;

  if v_forward.status = 'accepted' or v_reverse.status = 'accepted' or v_reverse.status = 'pending' then
    insert into public.friendships (user_id, friend_id, status)
    values
      (p_actor_id, p_target_id, 'accepted'),
      (p_target_id, p_actor_id, 'accepted')
    on conflict (user_id, friend_id) do update set status = excluded.status;
    return jsonb_build_object('status', 'accepted', 'merged', v_reverse.status = 'pending');
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values (p_actor_id, p_target_id, 'pending')
  on conflict (user_id, friend_id) do update set status = 'pending';

  return jsonb_build_object('status', 'pending', 'merged', false);
end;
$$;

create or replace function public.phase1_respond_friendship(
  p_receiver_id uuid,
  p_requester_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.friendships%rowtype;
begin
  if p_receiver_id = p_requester_id then
    raise exception using errcode = '22023', message = 'FRIEND_SELF_FORBIDDEN';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'FRIEND_DECISION_INVALID';
  end if;

  perform 1 from public.friendships
  where (user_id = p_requester_id and friend_id = p_receiver_id)
     or (user_id = p_receiver_id and friend_id = p_requester_id)
  order by user_id, friend_id
  for update;

  select * into v_request from public.friendships
  where user_id = p_requester_id and friend_id = p_receiver_id;

  if not found then
    if exists (
      select 1 from public.friendships
      where user_id = p_receiver_id and friend_id = p_requester_id and status = 'accepted'
    ) then
      return jsonb_build_object('status', 'accepted', 'reused', true);
    end if;
    raise exception using errcode = 'P0002', message = 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'accepted' then
    return jsonb_build_object('status', 'accepted', 'reused', true);
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'FRIEND_REQUEST_STATE_CONFLICT';
  end if;

  if p_decision = 'rejected' then
    delete from public.friendships
    where user_id = p_requester_id and friend_id = p_receiver_id and status = 'pending';
    return jsonb_build_object('status', 'rejected', 'reused', false);
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values
    (p_requester_id, p_receiver_id, 'accepted'),
    (p_receiver_id, p_requester_id, 'accepted')
  on conflict (user_id, friend_id) do update set status = excluded.status;

  return jsonb_build_object('status', 'accepted', 'reused', false);
end;
$$;

-- A confirmed pair is already connected: there is no separate room-level
-- “start game” gate. This replacement preserves confirmation idempotency.
create or replace function public.matchmaking_confirm_pair(
  p_pair_id uuid,
  p_user_id uuid,
  p_decision text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair public.matchmaking_pairs%rowtype;
  v_accepts integer;
  v_room public.rooms%rowtype;
  v_session public.sessions%rowtype;
  v_code text;
  v_attempt integer := 0;
  v_need jsonb;
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'CONFIRMATION_INVALID';
  end if;

  select * into v_pair from public.matchmaking_pairs where id = p_pair_id for update;
  if not found or p_user_id not in (v_pair.user_a_id, v_pair.user_b_id) then
    raise exception using errcode = '42501', message = 'PAIR_FORBIDDEN';
  end if;
  if v_pair.state in ('matched', 'playing', 'completed') then
    return to_jsonb(v_pair);
  end if;
  if v_pair.state <> 'waiting_confirmation' or v_pair.confirmation_deadline <= now() then
    raise exception using errcode = 'P0001', message = 'PAIR_CONFIRMATION_EXPIRED';
  end if;

  update public.matchmaking_confirmations
  set decision = p_decision, responded_at = now(), updated_at = now()
  where pair_id = v_pair.id and user_id = p_user_id;

  if p_decision = 'rejected' then
    update public.matchmaking_pairs
    set state = 'cancelled', cancel_reason = 'rejected', updated_at = now(), version = version + 1
    where id = v_pair.id
    returning * into v_pair;
    update public.matchmaking_tickets
    set state = 'searching', pair_id = null, confirmation_deadline = null,
        updated_at = now(), version = version + 1
    where pair_id = v_pair.id and expires_at > now();
    perform public.matchmaking_log_transition(
      null, v_pair.id, p_user_id, 'waiting_confirmation', 'cancelled', 'rejected', p_request_id
    );
    return to_jsonb(v_pair);
  end if;

  select count(*) into v_accepts
  from public.matchmaking_confirmations
  where pair_id = v_pair.id and decision = 'accepted';
  if v_accepts < 2 then
    return to_jsonb(v_pair) || jsonb_build_object('myDecision', 'accepted');
  end if;

  v_need := jsonb_build_object(
    'game', 'deadlock',
    'mode', (select mode from public.matchmaking_tickets where id = v_pair.ticket_a_id),
    'source', 'matchmaking_v1'
  );
  loop
    v_attempt := v_attempt + 1;
    v_code := public.phase1_room_code();
    begin
      insert into public.rooms(code,need,status,started_at)
      values(v_code,v_need,'playing',now())
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  insert into public.room_members(room_id,user_id,status)
  values
    (v_room.id, v_pair.user_a_id, 'active'),
    (v_room.id, v_pair.user_b_id, 'active');

  insert into public.sessions(
    room_id,room_code,players,need,outcome_by,rematch_by,status,started_at
  ) values(
    v_room.id,v_room.code,jsonb_build_array(v_pair.user_a_id::text,v_pair.user_b_id::text),
    v_need,'{}','{}','playing',now()
  ) returning * into v_session;

  update public.matchmaking_pairs
  set state='playing',room_id=v_room.id,session_id=v_session.id,
      matched_at=now(),playing_at=now(),updated_at=now(),version=version+1
  where id=v_pair.id
  returning * into v_pair;

  update public.matchmaking_tickets
  set state='playing',matched_at=now(),playing_at=now(),updated_at=now(),version=version+1
  where pair_id=v_pair.id;

  perform public.matchmaking_log_transition(
    null,v_pair.id,p_user_id,'waiting_confirmation','playing','both_confirmed',p_request_id
  );
  return to_jsonb(v_pair) || jsonb_build_object('roomCode',v_room.code);
end;
$$;

revoke all on function public.phase1_request_goodbye(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.phase1_request_friendship(uuid, uuid) from public, anon, authenticated;
revoke all on function public.phase1_respond_friendship(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.phase1_request_goodbye(uuid, uuid, boolean, text) to service_role;
grant execute on function public.phase1_request_friendship(uuid, uuid) to service_role;
grant execute on function public.phase1_respond_friendship(uuid, uuid, text) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.session_goodbye_requests;
exception when duplicate_object then null;
end $$;
