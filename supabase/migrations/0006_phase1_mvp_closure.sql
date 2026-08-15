-- Phase 1 MVP closure: canonical session lifecycle, atomic settlement,
-- rematch, recent connections, product events and tightened RLS.

-- ---------------------------------------------------------------------------
-- Expand the schema without removing legacy columns used by the current app.
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column if not exists rematch_of_session_id uuid null references public.sessions(id) on delete set null;

alter table public.sessions
  add column if not exists room_id uuid null references public.rooms(id) on delete cascade,
  add column if not exists started_at timestamptz null,
  add column if not exists ended_at timestamptz null,
  add column if not exists completed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists completion_reason text null,
  add column if not exists source_session_id uuid null references public.sessions(id) on delete set null,
  add column if not exists resolution text not null default 'waiting',
  add column if not exists version integer not null default 1;

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions add constraint sessions_status_check check (
  status in ('active', 'ready', 'playing', 'completed', 'cancelled')
);

alter table public.sessions drop constraint if exists sessions_resolution_check;
alter table public.sessions add constraint sessions_resolution_check check (
  resolution in ('waiting', 'accepted', 'declined')
);

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check check (
  status in ('connecting', 'ready', 'playing', 'finished', 'completed', 'closed', 'cancelled')
);

-- Link one canonical legacy session to each room. Older duplicates remain
-- unlinked so the migration never deletes user data.
with ranked as (
  select
    s.id as session_id,
    r.id as room_id,
    row_number() over (partition by r.id order by s.created_at desc, s.id desc) as rn
  from public.sessions s
  join public.rooms r on r.code = s.room_code
  where s.room_id is null
)
update public.sessions s
set room_id = ranked.room_id
from ranked
where s.id = ranked.session_id and ranked.rn = 1;

-- Preserve old rows while removing duplicate "owners" that would make the
-- new idempotency constraints impossible to create.
with ranked as (
  select id, row_number() over (partition by application_id order by created_at desc, id desc) as rn
  from public.rooms
  where application_id is not null
)
update public.rooms r
set application_id = null
from ranked
where r.id = ranked.id and ranked.rn > 1;

with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc, id desc) as rn
  from public.match_requests
  where status in ('matching', 'matched', 'playing')
)
update public.match_requests mr
set status = 'cancelled'
from ranked
where mr.id = ranked.id and ranked.rn > 1;

create unique index if not exists sessions_room_id_unique
  on public.sessions (room_id)
  where room_id is not null;
create unique index if not exists sessions_source_session_unique
  on public.sessions (source_session_id)
  where source_session_id is not null;
create unique index if not exists rooms_application_unique
  on public.rooms (application_id)
  where application_id is not null;
create unique index if not exists rooms_rematch_session_unique
  on public.rooms (rematch_of_session_id)
  where rematch_of_session_id is not null;
create unique index if not exists match_requests_one_active_per_user
  on public.match_requests (user_id)
  where status in ('matching', 'matched', 'playing');

-- ---------------------------------------------------------------------------
-- Per-player post-session responses.
-- ---------------------------------------------------------------------------
create table if not exists public.session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating text null check (rating in ('happy', 'meh', 'bad')),
  want_again boolean null,
  rematch_choice text null check (rematch_choice in ('yes', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists session_responses_user_idx
  on public.session_responses (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Make recent_connections an immutable per-session connection ledger.
-- ---------------------------------------------------------------------------
alter table public.recent_connections
  add column if not exists session_id uuid null references public.sessions(id) on delete set null;

update public.recent_connections rc
set session_id = s.id
from public.sessions s
where rc.session_id is null
  and rc.room_id = s.room_id
  and s.room_id is not null;

create unique index if not exists recent_connections_session_pair_unique
  on public.recent_connections (session_id, user_id, friend_id)
  where session_id is not null;

-- ---------------------------------------------------------------------------
-- First-party product events. Authoritative events are inserted by the same
-- transaction that changes product state.
-- ---------------------------------------------------------------------------
create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid null references public.profiles(id) on delete set null,
  session_id uuid null references public.sessions(id) on delete set null,
  room_id uuid null references public.rooms(id) on delete set null,
  match_request_id uuid null references public.match_requests(id) on delete set null,
  request_id text null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create unique index if not exists product_events_request_unique
  on public.product_events (request_id, event_name)
  where request_id is not null;
create index if not exists product_events_name_time_idx
  on public.product_events (event_name, occurred_at desc);
create index if not exists product_events_user_time_idx
  on public.product_events (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Direct profile reads are now own-profile only. Other-player data must
-- pass through a server DTO which omits friend codes and game accounts.
-- ---------------------------------------------------------------------------
alter table public.recent_connections enable row level security;
alter table public.session_responses enable row level security;
alter table public.product_events enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "recent_connections_select_own" on public.recent_connections;
create policy "recent_connections_select_own" on public.recent_connections
  for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists "session_responses_select_own" on public.session_responses;
create policy "session_responses_select_own" on public.session_responses
  for select to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists "session_responses_insert_own" on public.session_responses;
create policy "session_responses_insert_own" on public.session_responses
  for insert to authenticated
  with check (
    user_id = public.current_profile_id()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.players ? public.current_profile_id()::text
    )
  );

drop policy if exists "session_responses_update_own" on public.session_responses;
create policy "session_responses_update_own" on public.session_responses
  for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

-- There is intentionally no client policy for product_events. The server and
-- transaction functions write authoritative analytics using service_role.

-- ---------------------------------------------------------------------------
-- Helpers used only by service_role RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.phase1_room_code()
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 5));
$$;

create or replace function public.phase1_log_event(
  p_event_name text,
  p_user_id uuid default null,
  p_session_id uuid default null,
  p_room_id uuid default null,
  p_match_request_id uuid default null,
  p_request_id text default null,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_events (
    event_name, user_id, session_id, room_id, match_request_id, request_id, properties
  ) values (
    p_event_name, p_user_id, p_session_id, p_room_id, p_match_request_id,
    nullif(p_request_id, ''), coalesce(p_properties, '{}'::jsonb)
  )
  on conflict (request_id, event_name) where request_id is not null do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept an application and create exactly one room + ready session.
-- ---------------------------------------------------------------------------
create or replace function public.phase1_accept_application(
  p_application_id uuid,
  p_actor_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_app public.applications%rowtype;
  v_room public.rooms%rowtype;
  v_session public.sessions%rowtype;
  v_request public.match_requests%rowtype;
  v_need jsonb := '{}'::jsonb;
  v_code text;
  v_attempt integer := 0;
begin
  select * into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found or v_app.to_user_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'APPLICATION_FORBIDDEN';
  end if;

  if v_app.status = 'accepted' then
    select * into v_room from public.rooms where application_id = v_app.id limit 1;
    select * into v_session from public.sessions where room_id = v_room.id limit 1;
    return jsonb_build_object(
      'roomId', v_room.id, 'roomCode', v_room.code,
      'sessionId', v_session.id, 'sessionStatus', v_session.status
    );
  end if;

  if v_app.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'APPLICATION_ALREADY_RESOLVED';
  end if;

  if v_app.match_request_id is not null then
    select * into v_request from public.match_requests where id = v_app.match_request_id;
  end if;
  if v_request.id is null then
    select * into v_request
    from public.match_requests
    where user_id = v_app.from_user_id
      and status in ('matching', 'matched')
    order by created_at desc
    limit 1;
  end if;

  if v_request.id is not null then
    v_need := jsonb_build_object(
      'game', v_request.game_id,
      'mode', v_request.activity,
      'goal', v_request.goal,
      'current', v_request.current_player_count,
      'target', v_request.needed_player_count,
      'time', v_request.play_time,
      'duration', v_request.duration,
      'voice', v_request.voice_required,
      'playerType', v_request.desired_player_type,
      'details', coalesce(v_request.details, '{}'::jsonb)
    );
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.phase1_room_code();
    begin
      insert into public.rooms (code, application_id, need, status)
      values (v_code, v_app.id, v_need, 'ready')
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, status)
  values
    (v_room.id, v_app.from_user_id, 'active'),
    (v_room.id, v_app.to_user_id, 'active')
  on conflict (room_id, user_id) do update
    set status = 'active', exited_at = null;

  insert into public.sessions (
    room_id, room_code, players, need, outcome_by, rematch_by, status
  ) values (
    v_room.id,
    v_room.code,
    jsonb_build_array(v_app.from_user_id::text, v_app.to_user_id::text),
    v_need,
    '{}'::jsonb,
    '{}'::jsonb,
    'ready'
  ) returning * into v_session;

  update public.applications set status = 'accepted' where id = v_app.id;
  update public.applications
  set status = 'declined'
  where id <> v_app.id
    and status = 'pending'
    and (
      from_user_id in (v_app.from_user_id, v_app.to_user_id)
      or to_user_id in (v_app.from_user_id, v_app.to_user_id)
    );

  update public.match_requests
  set status = 'matched'
  where user_id in (v_app.from_user_id, v_app.to_user_id)
    and status = 'matching';

  perform public.phase1_log_event(
    'application_accepted', p_actor_id, v_session.id, v_room.id,
    v_request.id, p_request_id,
    jsonb_build_object('applicationId', v_app.id)
  );
  perform public.phase1_log_event(
    'room_created', p_actor_id, v_session.id, v_room.id,
    v_request.id, p_request_id,
    jsonb_build_object('source', 'application')
  );

  return jsonb_build_object(
    'roomId', v_room.id, 'roomCode', v_room.code,
    'sessionId', v_session.id, 'sessionStatus', v_session.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Start a ready session exactly once.
-- ---------------------------------------------------------------------------
create or replace function public.phase1_start_session(
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

  if v_session.status = 'playing' then
    return to_jsonb(v_session);
  end if;
  if v_session.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'SESSION_STATE_CONFLICT';
  end if;

  update public.sessions
  set status = 'playing', started_at = now(), version = version + 1
  where id = v_session.id
  returning * into v_session;

  update public.rooms
  set status = 'playing', started_at = coalesce(started_at, v_session.started_at)
  where id = v_session.room_id;

  update public.match_requests
  set status = 'playing'
  where user_id in (
    select rm.user_id from public.room_members rm where rm.room_id = v_session.room_id
  ) and status in ('matching', 'matched');

  perform public.phase1_log_event(
    'session_started', p_actor_id, v_session.id, v_session.room_id,
    null, p_request_id, '{}'::jsonb
  );
  return to_jsonb(v_session);
end;
$$;

-- Internal finalizer shared by explicit finish and last-member exit.
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
  set
    status = 'completed',
    ended_at = now(),
    completed_by = p_actor_id,
    completion_reason = p_reason,
    version = version + 1
  where id = v_session.id
  returning * into v_session;

  update public.rooms
  set status = 'completed', completed_at = v_session.ended_at
  where id = v_session.room_id;

  update public.match_requests
  set status = 'completed'
  where user_id in (
    select rm.user_id from public.room_members rm where rm.room_id = v_session.room_id
  ) and status in ('matching', 'matched', 'playing');

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

create or replace function public.phase1_complete_session(
  p_session_id uuid,
  p_actor_id uuid,
  p_reason text default 'explicit_finish',
  p_request_id text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.phase1_finalize_session(
    p_session_id, p_actor_id, p_reason, p_request_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Exit a room. Only the last active member settles/cancels the session.
-- ---------------------------------------------------------------------------
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
  v_active integer;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  update public.room_members
  set status = 'exited', exited_at = coalesce(exited_at, now())
  where room_id = v_session.room_id and user_id = p_actor_id;

  select count(*) into v_active
  from public.room_members
  where room_id = v_session.room_id and status = 'active';

  if v_active = 0 and v_session.status = 'ready' then
    update public.sessions
    set status = 'cancelled', ended_at = now(), completion_reason = 'abandoned', version = version + 1
    where id = v_session.id
    returning * into v_session;
    update public.rooms set status = 'cancelled', completed_at = v_session.ended_at
    where id = v_session.room_id;
    update public.match_requests
    set status = 'cancelled'
    where user_id in (
      select rm.user_id from public.room_members rm where rm.room_id = v_session.room_id
    ) and status in ('matching', 'matched');
  elsif v_active = 0 and v_session.status = 'playing' then
    return public.phase1_finalize_session(
      v_session.id, p_actor_id, 'all_members_exited', p_request_id
    );
  end if;

  return to_jsonb(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- Save a rematch choice. yes/yes atomically creates one new ready room/session.
-- ---------------------------------------------------------------------------
create or replace function public.phase1_submit_rematch(
  p_session_id uuid,
  p_actor_id uuid,
  p_choice text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions%rowtype;
  v_room public.rooms%rowtype;
  v_new_session public.sessions%rowtype;
  v_total integer;
  v_yes integer;
  v_no integer;
  v_rematch_by jsonb;
  v_code text;
  v_attempt integer := 0;
begin
  if p_choice not in ('yes', 'no') then
    raise exception using errcode = '22023', message = 'REMATCH_CHOICE_INVALID';
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;
  if v_session.status not in ('completed', 'active') then
    raise exception using errcode = 'P0001', message = 'SESSION_NOT_COMPLETED';
  end if;

  if v_session.resolution <> 'waiting' then
    select * into v_room from public.rooms where rematch_of_session_id = v_session.id limit 1;
    select * into v_new_session from public.sessions where source_session_id = v_session.id limit 1;
    return jsonb_build_object(
      'resolution', v_session.resolution,
      'roomId', v_room.id,
      'roomCode', v_room.code,
      'sessionId', v_new_session.id
    );
  end if;

  insert into public.session_responses (session_id, user_id, rematch_choice)
  values (v_session.id, p_actor_id, p_choice)
  on conflict (session_id, user_id) do update
    set rematch_choice = excluded.rematch_choice, updated_at = now();

  select jsonb_object_agg(user_id::text, rematch_choice)
  into v_rematch_by
  from public.session_responses
  where session_id = v_session.id and rematch_choice is not null;

  update public.sessions
  set rematch_by = coalesce(v_rematch_by, '{}'::jsonb), version = version + 1
  where id = v_session.id
  returning * into v_session;

  v_total := jsonb_array_length(v_session.players);
  select
    count(*) filter (where rematch_choice = 'yes'),
    count(*) filter (where rematch_choice = 'no')
  into v_yes, v_no
  from public.session_responses
  where session_id = v_session.id;

  if v_no > 0 then
    update public.sessions set resolution = 'declined', version = version + 1
    where id = v_session.id returning * into v_session;
    perform public.phase1_log_event(
      'rematch_declined', p_actor_id, v_session.id, v_session.room_id,
      null, p_request_id, '{}'::jsonb
    );
    return jsonb_build_object('resolution', 'declined');
  end if;

  if v_yes = v_total then
    loop
      v_attempt := v_attempt + 1;
      v_code := public.phase1_room_code();
      begin
        insert into public.rooms (code, need, status, rematch_of_session_id)
        values (v_code, v_session.need, 'ready', v_session.id)
        returning * into v_room;
        exit;
      exception when unique_violation then
        if v_attempt >= 8 then raise; end if;
      end;
    end loop;

    insert into public.room_members (room_id, user_id, status)
    select v_room.id, value::text::uuid, 'active'
    from jsonb_array_elements_text(v_session.players)
    on conflict (room_id, user_id) do nothing;

    insert into public.sessions (
      room_id, room_code, players, need, outcome_by, rematch_by,
      status, source_session_id
    ) values (
      v_room.id, v_room.code, v_session.players, v_session.need,
      '{}'::jsonb, '{}'::jsonb, 'ready', v_session.id
    ) returning * into v_new_session;

    update public.sessions set resolution = 'accepted', version = version + 1
    where id = v_session.id;

    perform public.phase1_log_event(
      'rematch_accepted', p_actor_id, v_session.id, v_session.room_id,
      null, p_request_id,
      jsonb_build_object('newSessionId', v_new_session.id, 'newRoomId', v_room.id)
    );

    return jsonb_build_object(
      'resolution', 'accepted',
      'roomId', v_room.id,
      'roomCode', v_room.code,
      'sessionId', v_new_session.id
    );
  end if;

  return jsonb_build_object('resolution', 'waiting');
end;
$$;

-- Only the server may call lifecycle functions. Authenticated clients use API
-- routes, which first resolve auth.uid() to the actor profile.
revoke all on function public.phase1_room_code() from public, anon, authenticated;
revoke all on function public.phase1_log_event(text, uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.phase1_accept_application(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.phase1_start_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.phase1_finalize_session(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.phase1_complete_session(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.phase1_exit_room(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.phase1_submit_rematch(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.phase1_accept_application(uuid, uuid, text) to service_role;
grant execute on function public.phase1_start_session(uuid, uuid, text) to service_role;
grant execute on function public.phase1_complete_session(uuid, uuid, text, text) to service_role;
grant execute on function public.phase1_exit_room(uuid, uuid, text) to service_role;
grant execute on function public.phase1_submit_rematch(uuid, uuid, text, text) to service_role;

-- Realtime consumers only need to refresh state; row visibility still follows
-- RLS. Ignore duplicate publication entries.
do $$
begin
  alter publication supabase_realtime add table public.session_responses;
exception when duplicate_object then null;
end $$;
