-- Casual group matchmaking.
-- Ranked matchmaking keeps the existing pair lifecycle and hard rules. Casual
-- requests use a small owner-led group so a player can start with a minimum
-- number of teammates without leaving the waiting pool in an ambiguous state.

alter table public.matchmaking_tickets
  add column if not exists desired_teammates smallint not null default 1,
  add column if not exists min_teammates smallint not null default 1,
  add column if not exists group_id uuid null;

alter table public.matchmaking_tickets drop constraint if exists matchmaking_casual_team_size_check;
alter table public.matchmaking_tickets add constraint matchmaking_casual_team_size_check check (
  mode = 'ranked'
  or (desired_teammates between 1 and 5 and min_teammates between 1 and desired_teammates)
);

create table if not exists public.matchmaking_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  mode text not null check (mode = 'casual'),
  state text not null default 'searching' check (state in (
    'searching','partial_ready','waiting_confirmation','matched','playing','completed','cancelled','expired'
  )),
  desired_teammates smallint not null check (desired_teammates between 1 and 5),
  min_teammates smallint not null check (min_teammates between 1 and desired_teammates),
  rule_set_id uuid not null references public.matchmaking_rule_sets(id),
  confirmation_deadline timestamptz null,
  room_id uuid null references public.rooms(id) on delete set null,
  session_id uuid null references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  cancel_reason text null,
  version integer not null default 1
);

create unique index if not exists matchmaking_group_one_open_owner
  on public.matchmaking_groups(owner_user_id)
  where state in ('searching','partial_ready','waiting_confirmation','matched','playing');
create index if not exists matchmaking_group_pool_idx
  on public.matchmaking_groups(game_id, state, created_at)
  where state in ('searching','partial_ready');

alter table public.matchmaking_tickets drop constraint if exists matchmaking_tickets_group_id_fkey;
alter table public.matchmaking_tickets add constraint matchmaking_tickets_group_id_fkey
  foreign key (group_id) references public.matchmaking_groups(id) on delete set null;

create table if not exists public.matchmaking_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.matchmaking_groups(id) on delete cascade,
  ticket_id uuid not null references public.matchmaking_tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_owner boolean not null default false,
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected')),
  joined_at timestamptz not null default now(),
  responded_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (group_id, user_id),
  unique (ticket_id)
);

create unique index if not exists matchmaking_group_one_owner
  on public.matchmaking_group_members(group_id) where is_owner;
create index if not exists matchmaking_group_member_user_idx
  on public.matchmaking_group_members(user_id, updated_at desc);

alter table public.matchmaking_groups enable row level security;
alter table public.matchmaking_group_members enable row level security;

create or replace function public.is_matchmaking_group_member(target_group_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.matchmaking_group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = public.current_profile_id()
  )
$$;
revoke all on function public.is_matchmaking_group_member(uuid) from public, anon;
grant execute on function public.is_matchmaking_group_member(uuid) to authenticated, service_role;

create policy "matchmaking_groups_read_member" on public.matchmaking_groups for select to authenticated
  using (public.is_matchmaking_group_member(id));
create policy "matchmaking_group_members_read_member" on public.matchmaking_group_members for select to authenticated
  using (public.is_matchmaking_group_member(group_id));

-- Extend the existing ticket starter without changing its API signature.
create or replace function public.matchmaking_start_ticket(
  p_user_id uuid, p_input jsonb, p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.matchmaking_tickets%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_rules public.matchmaking_rule_sets%rowtype;
  v_ttl integer;
  v_target smallint;
  v_min smallint;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  select * into v_existing from public.matchmaking_tickets
    where user_id = p_user_id and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
    order by created_at desc limit 1 for update;
  if found then return to_jsonb(v_existing) || jsonb_build_object('reused',true); end if;

  select * into v_rules from public.matchmaking_rule_sets
    where game_id = coalesce(nullif(p_input->>'gameId',''),'deadlock') and active limit 1;
  if not found then raise exception using errcode='P0001', message='MATCH_RULE_SET_MISSING'; end if;
  v_ttl := coalesce((v_rules.wait_strategy->>'ticketTtlSeconds')::integer,1800);
  v_target := case when p_input->>'mode' = 'casual'
    then least(5, greatest(1, coalesce((p_input->>'desiredTeammates')::integer, 1))) else 1 end;
  v_min := case when p_input->>'mode' = 'casual'
    then least(v_target, greatest(1, coalesce((p_input->>'minTeammates')::integer, greatest(1, v_target - 1)))) else 1 end;

  insert into public.matchmaking_tickets(
    user_id,game_id,mode,rank_code,desired_roles,microphone_preference,
    desired_teammates,min_teammates,state,rule_set_id,request_id,metadata,expires_at
  ) values (
    p_user_id,v_rules.game_id,p_input->>'mode',nullif(p_input->>'rankCode',''),
    array(select jsonb_array_elements_text(coalesce(p_input->'desiredRoles','[]'::jsonb))::smallint),
    coalesce(nullif(p_input->>'microphonePreference',''),'any'),
    v_target,v_min,'searching',v_rules.id,nullif(p_request_id,''),coalesce(p_input,'{}'::jsonb),now()+make_interval(secs=>v_ttl)
  ) returning * into v_ticket;
  perform public.matchmaking_log_transition(v_ticket.id,null,p_user_id,'idle','searching','start',p_request_id);
  return to_jsonb(v_ticket) || jsonb_build_object('reused',false);
end;
$$;

create or replace function public.matchmaking_ensure_group(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_group public.matchmaking_groups%rowtype;
  v_rules public.matchmaking_rule_sets%rowtype;
begin
  select * into v_ticket from public.matchmaking_tickets where id=p_ticket_id for update;
  if not found or v_ticket.mode <> 'casual' then
    raise exception using errcode='P0001', message='GROUP_MODE_REQUIRED';
  end if;
  if v_ticket.group_id is not null then
    select * into v_group from public.matchmaking_groups where id=v_ticket.group_id;
    return to_jsonb(v_group);
  end if;
  select * into v_rules from public.matchmaking_rule_sets where id=v_ticket.rule_set_id;
  insert into public.matchmaking_groups(
    owner_user_id,game_id,mode,desired_teammates,min_teammates,rule_set_id
  ) values (
    v_ticket.user_id,v_ticket.game_id,'casual',v_ticket.desired_teammates,v_ticket.min_teammates,v_ticket.rule_set_id
  ) returning * into v_group;
  insert into public.matchmaking_group_members(group_id,ticket_id,user_id,is_owner,decision)
    values(v_group.id,v_ticket.id,v_ticket.user_id,true,'accepted');
  update public.matchmaking_tickets set group_id=v_group.id,updated_at=now(),version=version+1 where id=v_ticket.id;
  return to_jsonb(v_group);
end;
$$;

create or replace function public.matchmaking_reserve_group_member(
  p_group_id uuid, p_ticket_id uuid, p_hard_snapshot jsonb default '{}'::jsonb,
  p_soft_snapshot jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group public.matchmaking_groups%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_own_group public.matchmaking_groups%rowtype;
  v_member_count integer;
begin
  select * into v_group from public.matchmaking_groups where id=p_group_id for update;
  select * into v_ticket from public.matchmaking_tickets where id=p_ticket_id for update;
  if not found or v_group.id is null or v_group.owner_user_id=v_ticket.user_id
     or v_group.state not in ('searching','partial_ready')
     or v_ticket.state <> 'searching' or v_ticket.expires_at<=now() then
    raise exception using errcode='40001', message='GROUP_RESERVATION_CONFLICT';
  end if;
  select count(*) into v_member_count from public.matchmaking_group_members
    where group_id=v_group.id and decision<>'rejected';
  -- desired_teammates excludes the owner; the owner is already member #1.
  if v_member_count >= v_group.desired_teammates + 1 then
    raise exception using errcode='40001', message='GROUP_RESERVATION_CONFLICT';
  end if;

  -- A simultaneous starter may have a one-person placeholder group. It is
  -- safe to absorb that placeholder; a group with more than its owner is not.
  if v_ticket.group_id is not null and v_ticket.group_id <> v_group.id then
    select * into v_own_group from public.matchmaking_groups where id=v_ticket.group_id for update;
    if v_own_group.owner_user_id<>v_ticket.user_id or v_own_group.state not in ('searching','partial_ready')
       or (select count(*) from public.matchmaking_group_members where group_id=v_own_group.id and decision<>'rejected') <> 1 then
      raise exception using errcode='40001', message='GROUP_RESERVATION_CONFLICT';
    end if;
    delete from public.matchmaking_group_members where group_id=v_own_group.id;
    update public.matchmaking_groups set state='cancelled',closed_at=now(),cancel_reason='absorbed',updated_at=now(),version=version+1 where id=v_own_group.id;
  end if;

  insert into public.matchmaking_group_members(group_id,ticket_id,user_id,is_owner,decision)
    values(v_group.id,v_ticket.id,v_ticket.user_id,false,'pending')
    on conflict (ticket_id) do update set group_id=excluded.group_id, decision='pending', updated_at=now();
  update public.matchmaking_tickets set group_id=v_group.id,state='candidate_found',confirmation_deadline=null,updated_at=now(),version=version+1
    where id=v_ticket.id;
  update public.matchmaking_groups set state='partial_ready',updated_at=now(),version=version+1 where id=v_group.id;
  perform public.matchmaking_log_transition(v_ticket.id,null,null,'searching','candidate_found','group_reserved',null,jsonb_build_object('groupId',v_group.id,'hard',coalesce(p_hard_snapshot,'{}'::jsonb),'soft',coalesce(p_soft_snapshot,'{}'::jsonb)));
  return to_jsonb(v_group);
end;
$$;

create or replace function public.matchmaking_start_group(
  p_group_id uuid, p_user_id uuid, p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_group public.matchmaking_groups%rowtype;
  v_count integer;
  v_ttl integer;
begin
  select * into v_group from public.matchmaking_groups where id=p_group_id for update;
  if not found or v_group.owner_user_id<>p_user_id then raise exception using errcode='42501',message='GROUP_FORBIDDEN'; end if;
  if v_group.state='waiting_confirmation' then return to_jsonb(v_group); end if;
  if v_group.state not in ('searching','partial_ready') then raise exception using errcode='P0001',message='GROUP_STATE_CONFLICT'; end if;
  select count(*) into v_count from public.matchmaking_group_members where group_id=v_group.id and not is_owner and decision<>'rejected';
  if v_count < v_group.min_teammates then raise exception using errcode='P0001',message='GROUP_MINIMUM_NOT_REACHED'; end if;
  select coalesce((wait_strategy->>'confirmationTtlSeconds')::integer,45) into v_ttl from public.matchmaking_rule_sets where id=v_group.rule_set_id;
  update public.matchmaking_groups set state='waiting_confirmation',confirmation_deadline=now()+make_interval(secs=>v_ttl),updated_at=now(),version=version+1 where id=v_group.id returning * into v_group;
  update public.matchmaking_group_members set decision=case when is_owner then 'accepted' else 'pending' end,responded_at=case when is_owner then now() else null end,updated_at=now() where group_id=v_group.id;
  update public.matchmaking_tickets set state='waiting_confirmation',confirmation_deadline=v_group.confirmation_deadline,updated_at=now(),version=version+1 where group_id=v_group.id and state in ('searching','candidate_found');
  perform public.matchmaking_log_transition(null,null,p_user_id,'partial_ready','waiting_confirmation','owner_started',p_request_id,jsonb_build_object('groupId',v_group.id));
  return to_jsonb(v_group);
end;
$$;

create or replace function public.matchmaking_confirm_group(
  p_group_id uuid, p_user_id uuid, p_decision text, p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_group public.matchmaking_groups%rowtype;
  v_member public.matchmaking_group_members%rowtype;
  v_total integer;
  v_accepts integer;
  v_room public.rooms%rowtype;
  v_session public.sessions%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_need jsonb;
  v_players jsonb;
  v_code text;
  v_attempt integer:=0;
begin
  if p_decision not in ('accepted','rejected') then raise exception using errcode='22023',message='CONFIRMATION_INVALID'; end if;
  select * into v_group from public.matchmaking_groups where id=p_group_id for update;
  select * into v_member from public.matchmaking_group_members where group_id=p_group_id and user_id=p_user_id for update;
  if not found or v_group.id is null then raise exception using errcode='42501',message='GROUP_FORBIDDEN'; end if;
  if v_group.state in ('matched','playing','completed') then return to_jsonb(v_group); end if;
  if v_group.state<>'waiting_confirmation' or v_group.confirmation_deadline<=now() then raise exception using errcode='P0001',message='GROUP_CONFIRMATION_EXPIRED'; end if;
  update public.matchmaking_group_members set decision=p_decision,responded_at=now(),updated_at=now() where id=v_member.id;
  if p_decision='rejected' then
    update public.matchmaking_tickets set state=case when expires_at>now() then 'searching' else 'expired' end,group_id=null,confirmation_deadline=null,updated_at=now(),version=version+1 where id=v_member.ticket_id;
    delete from public.matchmaking_group_members where id=v_member.id;
    update public.matchmaking_tickets set
      state=case when user_id=v_group.owner_user_id then 'searching' else 'candidate_found' end,
      confirmation_deadline=null,updated_at=now(),version=version+1
      where group_id=v_group.id and id<>v_member.ticket_id;
    update public.matchmaking_groups set state='partial_ready',confirmation_deadline=null,updated_at=now(),version=version+1 where id=v_group.id returning * into v_group;
    return to_jsonb(v_group)||jsonb_build_object('rejectedUserId',p_user_id);
  end if;
  select count(*) into v_total from public.matchmaking_group_members where group_id=v_group.id;
  select count(*) into v_accepts from public.matchmaking_group_members where group_id=v_group.id and decision='accepted';
  if v_accepts < v_total then return to_jsonb(v_group)||jsonb_build_object('myDecision','accepted'); end if;

  select metadata into v_need from public.matchmaking_tickets where group_id=v_group.id and user_id=v_group.owner_user_id limit 1;
  v_need:=jsonb_build_object('game','deadlock','mode','休闲','goal','休闲','current',v_total,'target',v_total,'time',coalesce(v_need->>'time','现在'),'voice',coalesce((v_need->>'microphonePreference')='on',true),'details',coalesce(v_need,'{}'::jsonb));
  loop
    v_attempt:=v_attempt+1; v_code:=public.phase1_room_code();
    begin
      insert into public.rooms(code,need,status) values(v_code,v_need,'ready') returning * into v_room; exit;
    exception when unique_violation then if v_attempt>=8 then raise; end if; end;
  end loop;
  select jsonb_agg(user_id::text order by joined_at) into v_players from public.matchmaking_group_members where group_id=v_group.id;
  insert into public.room_members(room_id,user_id,status)
    select v_room.id,user_id,'active' from public.matchmaking_group_members where group_id=v_group.id;
  insert into public.sessions(room_id,room_code,players,need,outcome_by,rematch_by,status)
    values(v_room.id,v_room.code,coalesce(v_players,'[]'::jsonb),v_need,'{}','{}','ready') returning * into v_session;
  update public.matchmaking_groups set state='matched',room_id=v_room.id,session_id=v_session.id,updated_at=now(),version=version+1 where id=v_group.id returning * into v_group;
  update public.matchmaking_tickets set state='matched',matched_at=now(),updated_at=now(),version=version+1 where group_id=v_group.id;
  perform public.matchmaking_log_transition(null,null,p_user_id,'waiting_confirmation','matched','all_confirmed',p_request_id,jsonb_build_object('groupId',v_group.id));
  return to_jsonb(v_group)||jsonb_build_object('roomCode',v_room.code);
end;
$$;

create or replace function public.matchmaking_cancel_group(
  p_user_id uuid, p_reason text default 'user_cancelled', p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_group public.matchmaking_groups%rowtype;
  v_member public.matchmaking_group_members%rowtype;
begin
  select * into v_ticket from public.matchmaking_tickets where user_id=p_user_id and mode='casual'
    and state in ('searching','candidate_found','waiting_confirmation') order by created_at desc limit 1 for update;
  if not found or v_ticket.group_id is null then return jsonb_build_object('state','idle'); end if;
  select * into v_group from public.matchmaking_groups where id=v_ticket.group_id for update;
  select * into v_member from public.matchmaking_group_members where group_id=v_group.id and user_id=p_user_id for update;
  if v_group.owner_user_id=p_user_id then
    update public.matchmaking_tickets set state=case when id=v_ticket.id then 'cancelled' else 'searching' end,group_id=null,confirmation_deadline=null,updated_at=now(),version=version+1 where group_id=v_group.id;
    update public.matchmaking_groups set state='cancelled',closed_at=now(),cancel_reason=p_reason,updated_at=now(),version=version+1 where id=v_group.id;
  else
    update public.matchmaking_tickets set state='cancelled',group_id=null,confirmation_deadline=null,closed_at=now(),cancel_reason=p_reason,updated_at=now(),version=version+1 where id=v_ticket.id;
    delete from public.matchmaking_group_members where id=v_member.id;
    update public.matchmaking_tickets set
      state=case when user_id=v_group.owner_user_id then 'searching' else 'candidate_found' end,
      confirmation_deadline=null,updated_at=now(),version=version+1
      where group_id=v_group.id and id<>v_ticket.id;
    update public.matchmaking_groups set state=case when state='waiting_confirmation' then 'partial_ready' else state end,confirmation_deadline=null,updated_at=now(),version=version+1 where id=v_group.id;
  end if;
  return to_jsonb(v_ticket)||jsonb_build_object('groupId',v_group.id);
end;
$$;

create or replace function public.matchmaking_expire_group_stale()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer:=0; v_rows integer:=0; v_group record;
begin
  for v_group in select * from public.matchmaking_groups where state='waiting_confirmation' and confirmation_deadline<=now() for update skip locked loop
    update public.matchmaking_groups set state='expired',closed_at=now(),cancel_reason='confirmation_timeout',updated_at=now(),version=version+1 where id=v_group.id;
    update public.matchmaking_tickets set state=case when expires_at>now() then 'searching' else 'expired' end,group_id=null,confirmation_deadline=null,updated_at=now(),version=version+1 where group_id=v_group.id;
    v_count:=v_count+1;
  end loop;
  -- A partially filled group can also go stale. Detach its tickets before
  -- closing the group, otherwise activeTicketRow would keep returning a
  -- searching ticket that can never join another group.
  update public.matchmaking_tickets set
    state=case when expires_at>now() then 'searching' else 'expired' end,
    group_id=null,confirmation_deadline=null,updated_at=now(),version=version+1
    where group_id in (select id from public.matchmaking_groups where state in ('searching','partial_ready') and updated_at + interval '90 seconds' <= now());
  update public.matchmaking_groups set state='expired',closed_at=now(),cancel_reason='stale',updated_at=now(),version=version+1
    where state in ('searching','partial_ready') and updated_at + interval '90 seconds' <= now();
  get diagnostics v_rows = row_count;
  v_count:=v_count+v_rows;
  return v_count;
end;
$$;

grant execute on function public.matchmaking_ensure_group(uuid) to service_role;
grant execute on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.matchmaking_start_group(uuid,uuid,text) to service_role;
grant execute on function public.matchmaking_confirm_group(uuid,uuid,text,text) to service_role;
grant execute on function public.matchmaking_cancel_group(uuid,text,text) to service_role;
grant execute on function public.matchmaking_expire_group_stale() to service_role;

do $$ begin
  alter publication supabase_realtime add table public.matchmaking_groups;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.matchmaking_group_members;
exception when duplicate_object then null; end $$;
