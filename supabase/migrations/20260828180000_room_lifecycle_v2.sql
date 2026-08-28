-- Room lifecycle V2: one authoritative Room stream, consensus recruitment,
-- participant-based settlement and idempotent chat operations.

alter table public.rooms
  add column if not exists room_membership_version bigint not null default 1;

alter table public.messages
  add column if not exists kind text not null default 'chat',
  add column if not exists client_operation_id text null;

create unique index if not exists messages_sender_operation_unique
  on public.messages(sender_id, client_operation_id)
  where client_operation_id is not null;

create table if not exists public.room_recruitment_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  membership_version bigint not null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.session_participant_settlements (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  settlement_kind text not null check (settlement_kind in ('goodbye','slipped','disconnect_timeout')),
  settled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.room_state_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_version bigint not null,
  event_type text not null,
  actor_id uuid null references public.profiles(id) on delete set null,
  operation_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_active_clients (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  client_instance_id text not null,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.profile_active_clients enable row level security;
create policy "profile_active_clients_read_own" on public.profile_active_clients
  for select to authenticated using (profile_id = public.current_profile_id());

create index if not exists room_state_events_room_version_idx
  on public.room_state_events(room_id, room_version desc);

alter table public.room_recruitment_votes enable row level security;
alter table public.session_participant_settlements enable row level security;
alter table public.room_state_events enable row level security;

create policy "room_recruitment_votes_read_member" on public.room_recruitment_votes
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = public.current_profile_id())
  );
create policy "session_settlements_read_participant" on public.session_participant_settlements
  for select to authenticated using (
    exists (select 1 from public.sessions s where s.id = session_id and s.players ? public.current_profile_id()::text)
  );
create policy "room_state_events_read_member" on public.room_state_events
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = public.current_profile_id())
  );

create or replace function public.append_room_state_event(
  p_room_id uuid, p_event_type text, p_actor_id uuid default null,
  p_operation_id text default null, p_payload jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_version bigint;
begin
  update public.rooms set realtime_version = realtime_version + 1 where id = p_room_id
  returning realtime_version into v_version;
  insert into public.room_state_events(room_id,room_version,event_type,actor_id,operation_id,payload)
  values (p_room_id,v_version,p_event_type,p_actor_id,p_operation_id,coalesce(p_payload,'{}'::jsonb));
  return v_version;
end;
$$;

create or replace function public.room_membership_v2_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_user_id uuid; v_left boolean := false;
begin
  v_room_id := coalesce(new.room_id, old.room_id);
  v_user_id := coalesce(new.user_id, old.user_id);
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  v_left := tg_op = 'DELETE' or (tg_op = 'UPDATE' and coalesce(old.status,'active') = 'active' and coalesce(new.status,'active') <> 'active');
  if v_left then
    update public.rooms set room_membership_version = room_membership_version + 1 where id = v_room_id;
    delete from public.room_recruitment_votes where room_id = v_room_id;
  end if;
  insert into public.messages(room_id,sender_id,content,kind,client_operation_id)
  values(v_room_id,v_user_id,case when v_left then '离开了 Room' else '加入了 Room' end,
         case when v_left then 'member_left' else 'member_joined' end,
         format('member:%s:%s:%s',v_room_id,v_user_id,case when v_left then 'left' else 'joined' end))
  on conflict(sender_id,client_operation_id) where client_operation_id is not null do nothing;
  perform public.append_room_state_event(v_room_id, case when v_left then 'member_left' else 'member_joined' end, v_user_id, null, '{}'::jsonb);
  return coalesce(new, old);
end;
$$;

drop trigger if exists room_members_v2_lifecycle on public.room_members;
create trigger room_members_v2_lifecycle after insert or update of status or delete on public.room_members
for each row execute function public.room_membership_v2_changed();

-- Explicit trigger names make the Room authority coverage auditable.
drop trigger if exists messages_bump_room_version on public.messages;
create trigger messages_bump_room_version after insert or update or delete on public.messages
for each row execute function public.bump_room_realtime_version();
drop trigger if exists room_members_bump_room_version on public.room_members;
drop trigger if exists room_members_bump_realtime_version on public.room_members;
create trigger room_members_bump_room_version after insert or update or delete on public.room_members
for each row execute function public.bump_room_realtime_version();

create or replace function public.bump_session_room_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_room_id uuid;
begin
  select room_id into v_room_id from public.sessions where id = coalesce(new.session_id,old.session_id);
  if v_room_id is not null then perform public.append_room_state_event(v_room_id,tg_table_name,null,null,'{}'::jsonb); end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists session_goodbye_requests_bump_room_version on public.session_goodbye_requests;
create trigger session_goodbye_requests_bump_room_version after insert or update or delete on public.session_goodbye_requests
for each row execute function public.bump_session_room_version();
drop trigger if exists room_recruitment_votes_bump_room_version on public.room_recruitment_votes;
create trigger room_recruitment_votes_bump_room_version after insert or update or delete on public.room_recruitment_votes
for each row execute function public.bump_room_realtime_version();

create or replace function public.toggle_room_recruitment_vote(
  p_room_id uuid, p_actor_id uuid, p_requested boolean, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room public.rooms%rowtype; v_group public.matchmaking_groups%rowtype; v_total integer; v_votes integer; v_result jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'connecting' or coalesce(v_room.formation_state,'') in ('locked','formal') then
    raise exception using errcode='P0001', message='ROOM_NOT_RECRUITING';
  end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=p_actor_id and status='active') then
    raise exception using errcode='42501', message='ROOM_MEMBER_INACTIVE';
  end if;
  if p_requested then
    insert into public.room_recruitment_votes(room_id,user_id,membership_version)
    values(p_room_id,p_actor_id,v_room.room_membership_version)
    on conflict(room_id,user_id) do update set membership_version=excluded.membership_version,updated_at=now();
    insert into public.messages(room_id,sender_id,content,kind,client_operation_id)
    values(p_room_id,p_actor_id,'停止招募','recruitment_vote',p_request_id)
    on conflict(sender_id,client_operation_id) where client_operation_id is not null do nothing;
  else
    delete from public.room_recruitment_votes where room_id=p_room_id and user_id=p_actor_id;
  end if;
  select count(*) into v_total from public.room_members where room_id=p_room_id and status='active';
  select count(*) into v_votes from public.room_recruitment_votes rv
    join public.room_members rm on rm.room_id=rv.room_id and rm.user_id=rv.user_id and rm.status='active'
   where rv.room_id=p_room_id and rv.membership_version=v_room.room_membership_version;
  perform public.append_room_state_event(p_room_id,case when p_requested then 'recruitment_vote' else 'recruitment_vote_withdrawn' end,p_actor_id,p_request_id,jsonb_build_object('votes',v_votes,'total',v_total));
  if p_requested and v_total > 1 and v_votes = v_total then
    select * into v_group from public.matchmaking_groups where room_id=p_room_id for update;
    if found then v_result := public.matchmaking_lock_forming_group(v_group.id,p_actor_id,p_request_id); end if;
  end if;
  return jsonb_build_object('requested',p_requested,'votes',v_votes,'total',v_total,'locked',v_total>1 and v_votes=v_total,'group',v_result);
end;
$$;

create or replace function public.settle_session_participant(
  p_session_id uuid, p_actor_id uuid, p_kind text, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.sessions%rowtype; v_total integer; v_settled integer; v_result jsonb;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then raise exception using errcode='42501',message='SESSION_FORBIDDEN'; end if;
  if p_kind not in ('goodbye','slipped','disconnect_timeout') then raise exception using errcode='P0001',message='SETTLEMENT_KIND_INVALID'; end if;
  insert into public.session_participant_settlements(session_id,user_id,settlement_kind)
  values(p_session_id,p_actor_id,p_kind)
  on conflict(session_id,user_id) do update set settlement_kind=excluded.settlement_kind,updated_at=now();
  select count(*) into v_total from jsonb_array_elements_text(v_session.players);
  select count(*) into v_settled from public.session_participant_settlements where session_id=p_session_id;
  if v_total > 1 and v_settled=v_total and v_session.status in ('ready','playing') then
    v_result := public.phase1_complete_session(p_session_id,p_actor_id,'mutual_goodbye',p_request_id);
  end if;
  return coalesce(v_result,to_jsonb(v_session)) || jsonb_build_object('settledCount',v_settled,'participantCount',v_total,'completed',v_total>1 and v_settled=v_total);
end;
$$;

create or replace function public.phase1_request_goodbye(
  p_session_id uuid, p_actor_id uuid, p_requested boolean, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.sessions%rowtype; v_total integer; v_request_count integer; v_result jsonb;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then raise exception using errcode='42501',message='SESSION_FORBIDDEN'; end if;
  if v_session.status='completed' and v_session.completion_reason='mutual_goodbye' then return to_jsonb(v_session)||jsonb_build_object('completed',true,'reused',true); end if;
  if v_session.status not in ('ready','playing') then raise exception using errcode='P0001',message='SESSION_NOT_PLAYING'; end if;
  if p_requested then
    insert into public.session_goodbye_requests(session_id,user_id) values(p_session_id,p_actor_id)
      on conflict(session_id,user_id) do update set updated_at=now();
    insert into public.messages(room_id,sender_id,content,kind,client_operation_id)
    values(v_session.room_id,p_actor_id,'拜拜','goodbye',p_request_id)
    on conflict(sender_id,client_operation_id) where client_operation_id is not null do nothing;
    v_result := public.settle_session_participant(p_session_id,p_actor_id,'goodbye',p_request_id);
  else
    delete from public.session_goodbye_requests where session_id=p_session_id and user_id=p_actor_id;
    delete from public.session_participant_settlements where session_id=p_session_id and user_id=p_actor_id and settlement_kind='goodbye';
    v_result := to_jsonb(v_session);
  end if;
  select count(*) into v_total from jsonb_array_elements_text(v_session.players);
  select count(*) into v_request_count from public.session_participant_settlements where session_id=p_session_id;
  return v_result || jsonb_build_object('requested',p_requested,'requestCount',v_request_count,'participantCount',v_total,'completed',v_total>1 and v_request_count=v_total);
end;
$$;

create or replace function public.phase1_slip_room(
  p_session_id uuid, p_actor_id uuid, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.sessions%rowtype; v_result jsonb;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then raise exception using errcode='42501',message='SESSION_FORBIDDEN'; end if;
  if not exists(select 1 from public.session_participant_settlements where session_id=p_session_id and user_id=p_actor_id) then
    raise exception using errcode='P0001',message='GOODBYE_REQUIRED_BEFORE_SLIP';
  end if;
  v_result := public.settle_session_participant(p_session_id,p_actor_id,'slipped',p_request_id);
  update public.room_members set status='exited',exited_at=coalesce(exited_at,now())
   where room_id=v_session.room_id and user_id=p_actor_id and status='active';
  return v_result || jsonb_build_object('slipped',true);
end;
$$;

create or replace function public.phase1_timeout_leave(
  p_session_id uuid, p_actor_id uuid, p_request_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.sessions%rowtype; v_result jsonb;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then raise exception using errcode='42501',message='SESSION_FORBIDDEN'; end if;
  if v_session.status not in ('ready','playing') then return to_jsonb(v_session); end if;
  v_result := public.settle_session_participant(p_session_id,p_actor_id,'disconnect_timeout',p_request_id);
  update public.room_members set status='exited',exited_at=coalesce(exited_at,now()),disconnected_at=null
   where room_id=v_session.room_id and user_id=p_actor_id and status='active';
  return v_result || jsonb_build_object('timeoutSettled',true);
end;
$$;

revoke all on function public.toggle_room_recruitment_vote(uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.settle_session_participant(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.phase1_slip_room(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.phase1_timeout_leave(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.toggle_room_recruitment_vote(uuid,uuid,boolean,text) to service_role;
grant execute on function public.settle_session_participant(uuid,uuid,text,text) to service_role;
grant execute on function public.phase1_slip_room(uuid,uuid,text) to service_role;
grant execute on function public.phase1_timeout_leave(uuid,uuid,text) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.room_recruitment_votes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.session_participant_settlements;
exception when duplicate_object then null; end $$;
