-- Deadlock realtime matchmaking skeleton.
-- Rules are versioned data; lifecycle integrity is enforced in transactions.

create table if not exists public.matchmaking_rule_sets (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  version text not null,
  active boolean not null default false,
  hard_rules jsonb not null default '{}'::jsonb,
  soft_preferences jsonb not null default '{}'::jsonb,
  wait_strategy jsonb not null default '{}'::jsonb,
  source_url text null,
  source_published_at timestamptz null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (game_id, version)
);

create unique index if not exists matchmaking_one_active_ruleset_per_game
  on public.matchmaking_rule_sets (game_id) where active;

insert into public.matchmaking_rule_sets (
  game_id, version, active, hard_rules, soft_preferences, wait_strategy,
  source_url, source_published_at, notes
)
values (
  'deadlock', 'official-2024-11-21', true,
  jsonb_build_object(
    'allowedModes', jsonb_build_array('ranked', 'casual'),
    'rankedPartyMax', 6,
    'highRankThreshold', 'ascendant_1',
    'highRankPartyMax', 3,
    'maxRankDistance', null,
    'rankOrder', jsonb_build_array(
      'initiate','seeker','alchemist','arcanist','ritualist','emissary',
      'archon','oracle','phantom','ascendant','eternus'
    )
  ),
  jsonb_build_object('priority', jsonb_build_array('desiredRoles', 'microphonePreference')),
  jsonb_build_object('ticketTtlSeconds', 1800, 'confirmationTtlSeconds', 45, 'heartbeatTtlSeconds', 90, 'rejectedPairCooldownSeconds', 300),
  'https://forums.playdeadlock.com/threads/11-21-2024-update.47476/',
  '2024-11-21T00:00:00Z',
  'No public rank-gap cutoff is invented. Activate a new version when Valve publishes a replacement rule.'
)
on conflict (game_id, version) do update set
  hard_rules = excluded.hard_rules,
  soft_preferences = excluded.soft_preferences,
  wait_strategy = excluded.wait_strategy,
  source_url = excluded.source_url,
  source_published_at = excluded.source_published_at,
  notes = excluded.notes;

create table if not exists public.matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  mode text not null check (mode in ('ranked', 'casual')),
  rank_code text null,
  desired_roles smallint[] not null default '{}',
  microphone_preference text not null default 'any' check (microphone_preference in ('on','off','any')),
  state text not null default 'searching' check (state in (
    'searching','candidate_found','waiting_confirmation','matched','playing','completed','cancelled','expired'
  )),
  rule_set_id uuid not null references public.matchmaking_rule_sets(id),
  pair_id uuid null,
  request_id text null,
  heartbeat_at timestamptz not null default now(),
  search_started_at timestamptz not null default now(),
  confirmation_deadline timestamptz null,
  expires_at timestamptz not null,
  matched_at timestamptz null,
  playing_at timestamptz null,
  completed_at timestamptz null,
  closed_at timestamptz null,
  cancel_reason text null,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchmaking_rank_required check (mode <> 'ranked' or nullif(rank_code, '') is not null),
  constraint matchmaking_roles_valid check (desired_roles <@ array[1,2,3,4,5,6]::smallint[])
);

create unique index if not exists matchmaking_one_active_ticket_per_user
  on public.matchmaking_tickets (user_id)
  where state in ('searching','candidate_found','waiting_confirmation','matched','playing');
create unique index if not exists matchmaking_ticket_request_id_unique
  on public.matchmaking_tickets (user_id, request_id) where request_id is not null;
create index if not exists matchmaking_waiting_pool_idx
  on public.matchmaking_tickets (game_id, mode, search_started_at)
  where state = 'searching';
create index if not exists matchmaking_ticket_expiry_idx
  on public.matchmaking_tickets (state, expires_at, heartbeat_at);

create table if not exists public.matchmaking_pairs (
  id uuid primary key default gen_random_uuid(),
  ticket_a_id uuid not null references public.matchmaking_tickets(id),
  ticket_b_id uuid not null references public.matchmaking_tickets(id),
  user_a_id uuid not null references public.profiles(id),
  user_b_id uuid not null references public.profiles(id),
  state text not null default 'candidate_found' check (state in (
    'candidate_found','waiting_confirmation','matched','playing','completed','cancelled','expired'
  )),
  rule_set_id uuid not null references public.matchmaking_rule_sets(id),
  hard_rule_snapshot jsonb not null default '{}'::jsonb,
  soft_preference_snapshot jsonb not null default '{}'::jsonb,
  confirmation_deadline timestamptz not null,
  room_id uuid null references public.rooms(id) on delete set null,
  session_id uuid null references public.sessions(id) on delete set null,
  matched_at timestamptz null,
  playing_at timestamptz null,
  completed_at timestamptz null,
  closed_at timestamptz null,
  cancel_reason text null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchmaking_pair_distinct_users check (user_a_id <> user_b_id),
  constraint matchmaking_pair_distinct_tickets check (ticket_a_id <> ticket_b_id)
);

alter table public.matchmaking_tickets drop constraint if exists matchmaking_tickets_pair_id_fkey;
alter table public.matchmaking_tickets add constraint matchmaking_tickets_pair_id_fkey
  foreign key (pair_id) references public.matchmaking_pairs(id) on delete set null;
create unique index if not exists matchmaking_pair_room_unique on public.matchmaking_pairs(room_id) where room_id is not null;
create unique index if not exists matchmaking_pair_session_unique on public.matchmaking_pairs(session_id) where session_id is not null;
create index if not exists matchmaking_pairs_user_a_idx on public.matchmaking_pairs(user_a_id, created_at desc);
create index if not exists matchmaking_pairs_user_b_idx on public.matchmaking_pairs(user_b_id, created_at desc);

create table if not exists public.matchmaking_confirmations (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.matchmaking_pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected')),
  responded_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (pair_id, user_id)
);

create table if not exists public.matchmaking_feedback (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.matchmaking_pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  did_play boolean not null,
  rating text null check (rating in ('happy','meh','bad')),
  want_again boolean null,
  tags jsonb not null default '[]'::jsonb,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pair_id, user_id)
);

create table if not exists public.matchmaking_state_events (
  id bigint generated always as identity primary key,
  ticket_id uuid null references public.matchmaking_tickets(id) on delete set null,
  pair_id uuid null references public.matchmaking_pairs(id) on delete set null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  from_state text null,
  to_state text not null,
  reason text null,
  request_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists matchmaking_event_request_idx
  on public.matchmaking_state_events(request_id) where request_id is not null;
create index if not exists matchmaking_event_ticket_idx on public.matchmaking_state_events(ticket_id, occurred_at);
create index if not exists matchmaking_event_pair_idx on public.matchmaking_state_events(pair_id, occurred_at);

alter table public.matchmaking_rule_sets enable row level security;
alter table public.matchmaking_tickets enable row level security;
alter table public.matchmaking_pairs enable row level security;
alter table public.matchmaking_confirmations enable row level security;
alter table public.matchmaking_feedback enable row level security;
alter table public.matchmaking_state_events enable row level security;

create policy "matchmaking_rules_read" on public.matchmaking_rule_sets for select to authenticated using (active);
create policy "matchmaking_tickets_read_own" on public.matchmaking_tickets for select to authenticated
  using (user_id = public.current_profile_id());
create policy "matchmaking_pairs_read_own" on public.matchmaking_pairs for select to authenticated
  using (user_a_id = public.current_profile_id() or user_b_id = public.current_profile_id());
create policy "matchmaking_confirmations_read_own_pair" on public.matchmaking_confirmations for select to authenticated
  using (exists (
    select 1 from public.matchmaking_pairs p where p.id = pair_id
      and public.current_profile_id() in (p.user_a_id, p.user_b_id)
  ));
create policy "matchmaking_feedback_read_own" on public.matchmaking_feedback for select to authenticated
  using (user_id = public.current_profile_id());
-- Writes and the state-event ledger are deliberately server/service-role only.

create or replace function public.matchmaking_log_transition(
  p_ticket_id uuid, p_pair_id uuid, p_actor_id uuid, p_from text, p_to text,
  p_reason text default null, p_request_id text default null, p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.matchmaking_state_events(
    ticket_id,pair_id,actor_user_id,from_state,to_state,reason,request_id,metadata
  ) values (p_ticket_id,p_pair_id,p_actor_id,p_from,p_to,p_reason,nullif(p_request_id,''),coalesce(p_metadata,'{}'::jsonb));
end;
$$;

create or replace function public.matchmaking_start_ticket(
  p_user_id uuid, p_input jsonb, p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.matchmaking_tickets%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_rules public.matchmaking_rule_sets%rowtype;
  v_ttl integer;
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

  insert into public.matchmaking_tickets(
    user_id,game_id,mode,rank_code,desired_roles,microphone_preference,
    state,rule_set_id,request_id,expires_at
  ) values (
    p_user_id,v_rules.game_id,p_input->>'mode',nullif(p_input->>'rankCode',''),
    array(select jsonb_array_elements_text(coalesce(p_input->'desiredRoles','[]'::jsonb))::smallint),
    coalesce(nullif(p_input->>'microphonePreference',''),'any'),
    'searching',v_rules.id,nullif(p_request_id,''),now()+make_interval(secs=>v_ttl)
  ) returning * into v_ticket;
  perform public.matchmaking_log_transition(v_ticket.id,null,p_user_id,'idle','searching','start',p_request_id);
  return to_jsonb(v_ticket) || jsonb_build_object('reused',false);
end;
$$;

create or replace function public.matchmaking_heartbeat(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.matchmaking_tickets%rowtype;
begin
  update public.matchmaking_tickets set heartbeat_at=now(),updated_at=now(),version=version+1
    where user_id=p_user_id and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
    returning * into v_ticket;
  return to_jsonb(v_ticket);
end;
$$;

create or replace function public.matchmaking_reserve_pair(
  p_ticket_a uuid, p_ticket_b uuid, p_hard_snapshot jsonb, p_soft_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.matchmaking_tickets%rowtype; v_b public.matchmaking_tickets%rowtype;
  v_pair public.matchmaking_pairs%rowtype; v_ttl integer;
begin
  perform 1 from public.matchmaking_tickets where id in (p_ticket_a,p_ticket_b) order by id for update;
  select * into v_a from public.matchmaking_tickets where id=p_ticket_a;
  select * into v_b from public.matchmaking_tickets where id=p_ticket_b;
  if v_a.state<>'searching' or v_b.state<>'searching' or v_a.user_id=v_b.user_id
     or v_a.expires_at<=now() or v_b.expires_at<=now() then
    raise exception using errcode='40001',message='MATCH_RESERVATION_CONFLICT';
  end if;
  v_ttl := coalesce((select (wait_strategy->>'confirmationTtlSeconds')::integer from public.matchmaking_rule_sets where id=v_a.rule_set_id),45);
  insert into public.matchmaking_pairs(
    ticket_a_id,ticket_b_id,user_a_id,user_b_id,state,rule_set_id,hard_rule_snapshot,soft_preference_snapshot,confirmation_deadline
  ) values (
    v_a.id,v_b.id,v_a.user_id,v_b.user_id,'candidate_found',v_a.rule_set_id,
    coalesce(p_hard_snapshot,'{}'::jsonb),coalesce(p_soft_snapshot,'{}'::jsonb),now()+make_interval(secs=>v_ttl)
  ) returning * into v_pair;
  insert into public.matchmaking_confirmations(pair_id,user_id) values
    (v_pair.id,v_a.user_id),(v_pair.id,v_b.user_id);
  update public.matchmaking_tickets set state='candidate_found',pair_id=v_pair.id,
    confirmation_deadline=v_pair.confirmation_deadline,updated_at=now(),version=version+1
    where id in (v_a.id,v_b.id);
  perform public.matchmaking_log_transition(v_a.id,v_pair.id,null,'searching','candidate_found','reserved');
  perform public.matchmaking_log_transition(v_b.id,v_pair.id,null,'searching','candidate_found','reserved');
  return to_jsonb(v_pair);
end;
$$;

create or replace function public.matchmaking_present_pair(p_pair_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pair public.matchmaking_pairs%rowtype;
begin
  select * into v_pair from public.matchmaking_pairs where id=p_pair_id for update;
  if v_pair.state='waiting_confirmation' then return to_jsonb(v_pair); end if;
  if v_pair.state<>'candidate_found' then raise exception using errcode='P0001',message='PAIR_STATE_CONFLICT'; end if;
  update public.matchmaking_pairs set state='waiting_confirmation',updated_at=now(),version=version+1
    where id=v_pair.id returning * into v_pair;
  update public.matchmaking_tickets set state='waiting_confirmation',updated_at=now(),version=version+1
    where pair_id=v_pair.id and state='candidate_found';
  perform public.matchmaking_log_transition(null,v_pair.id,null,'candidate_found','waiting_confirmation','presented');
  return to_jsonb(v_pair);
end;
$$;

create or replace function public.matchmaking_cancel_ticket(
  p_user_id uuid,p_reason text default 'user_cancelled',p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.matchmaking_tickets%rowtype; v_pair public.matchmaking_pairs%rowtype; v_partner uuid; v_from text;
begin
  select * into v_ticket from public.matchmaking_tickets where user_id=p_user_id
    and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
    order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('state','idle','reused',true); end if;
  if v_ticket.state in ('matched','playing') then
    raise exception using errcode='P0001',message='MATCH_ALREADY_CONNECTED';
  end if;
  v_from:=v_ticket.state;
  if v_ticket.pair_id is not null then
    select * into v_pair from public.matchmaking_pairs where id=v_ticket.pair_id for update;
    if v_pair.state in ('candidate_found','waiting_confirmation') then
      update public.matchmaking_pairs set state='cancelled',cancel_reason=p_reason,updated_at=now(),version=version+1 where id=v_pair.id;
      v_partner := case when v_pair.user_a_id=p_user_id then v_pair.user_b_id else v_pair.user_a_id end;
      update public.matchmaking_tickets set state='searching',pair_id=null,confirmation_deadline=null,
        search_started_at=least(search_started_at,now()),updated_at=now(),version=version+1
        where user_id=v_partner and pair_id=v_pair.id and expires_at>now();
      perform public.matchmaking_log_transition(null,v_pair.id,p_user_id,v_pair.state,'cancelled',p_reason,p_request_id);
    end if;
  end if;
  update public.matchmaking_tickets set state='cancelled',cancel_reason=p_reason,closed_at=now(),updated_at=now(),version=version+1
    where id=v_ticket.id returning * into v_ticket;
  perform public.matchmaking_log_transition(v_ticket.id,v_ticket.pair_id,p_user_id,v_from,'cancelled',p_reason,p_request_id);
  return to_jsonb(v_ticket);
end;
$$;

create or replace function public.matchmaking_confirm_pair(
  p_pair_id uuid,p_user_id uuid,p_decision text,p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public,extensions as $$
declare
  v_pair public.matchmaking_pairs%rowtype; v_accepts integer; v_room public.rooms%rowtype;
  v_session public.sessions%rowtype; v_code text; v_attempt integer:=0; v_need jsonb;
begin
  if p_decision not in ('accepted','rejected') then raise exception using errcode='22023',message='CONFIRMATION_INVALID'; end if;
  select * into v_pair from public.matchmaking_pairs where id=p_pair_id for update;
  if not found or p_user_id not in (v_pair.user_a_id,v_pair.user_b_id) then
    raise exception using errcode='42501',message='PAIR_FORBIDDEN';
  end if;
  if v_pair.state in ('matched','playing','completed') then return to_jsonb(v_pair); end if;
  if v_pair.state<>'waiting_confirmation' or v_pair.confirmation_deadline<=now() then
    raise exception using errcode='P0001',message='PAIR_CONFIRMATION_EXPIRED';
  end if;
  update public.matchmaking_confirmations set decision=p_decision,responded_at=now(),updated_at=now()
    where pair_id=v_pair.id and user_id=p_user_id;
  if p_decision='rejected' then
    update public.matchmaking_pairs set state='cancelled',cancel_reason='rejected',updated_at=now(),version=version+1 where id=v_pair.id returning * into v_pair;
    update public.matchmaking_tickets set state='searching',pair_id=null,confirmation_deadline=null,updated_at=now(),version=version+1
      where pair_id=v_pair.id and expires_at>now();
    perform public.matchmaking_log_transition(null,v_pair.id,p_user_id,'waiting_confirmation','cancelled','rejected',p_request_id);
    return to_jsonb(v_pair);
  end if;
  select count(*) into v_accepts from public.matchmaking_confirmations where pair_id=v_pair.id and decision='accepted';
  if v_accepts<2 then return to_jsonb(v_pair)||jsonb_build_object('myDecision','accepted'); end if;

  v_need:=jsonb_build_object('game','deadlock','mode',(select mode from public.matchmaking_tickets where id=v_pair.ticket_a_id),'source','matchmaking_v1');
  loop
    v_attempt:=v_attempt+1; v_code:=public.phase1_room_code();
    begin
      insert into public.rooms(code,need,status) values(v_code,v_need,'ready') returning * into v_room; exit;
    exception when unique_violation then if v_attempt>=8 then raise; end if; end;
  end loop;
  insert into public.room_members(room_id,user_id,status) values
    (v_room.id,v_pair.user_a_id,'active'),(v_room.id,v_pair.user_b_id,'active');
  insert into public.sessions(room_id,room_code,players,need,outcome_by,rematch_by,status)
    values(v_room.id,v_room.code,jsonb_build_array(v_pair.user_a_id::text,v_pair.user_b_id::text),v_need,'{}','{}','ready')
    returning * into v_session;
  update public.matchmaking_pairs set state='matched',room_id=v_room.id,session_id=v_session.id,matched_at=now(),updated_at=now(),version=version+1
    where id=v_pair.id returning * into v_pair;
  update public.matchmaking_tickets set state='matched',matched_at=now(),updated_at=now(),version=version+1 where pair_id=v_pair.id;
  perform public.matchmaking_log_transition(null,v_pair.id,p_user_id,'waiting_confirmation','matched','both_confirmed',p_request_id);
  return to_jsonb(v_pair)||jsonb_build_object('roomCode',v_room.code);
end;
$$;

create or replace function public.matchmaking_expire_stale()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer:=0; v_rows integer:=0; v_pair record;
begin
  for v_pair in select * from public.matchmaking_pairs where state in ('candidate_found','waiting_confirmation') and confirmation_deadline<=now() for update skip locked loop
    update public.matchmaking_pairs set state='expired',cancel_reason='confirmation_timeout',updated_at=now(),version=version+1 where id=v_pair.id;
    update public.matchmaking_tickets set state=case when expires_at>now() then 'searching' else 'expired' end,
      pair_id=null,confirmation_deadline=null,updated_at=now(),version=version+1 where pair_id=v_pair.id;
    perform public.matchmaking_log_transition(null,v_pair.id,null,v_pair.state,'expired','confirmation_timeout');
    v_count:=v_count+1;
  end loop;
  with stale as (
    select t.id,t.state from public.matchmaking_tickets t join public.matchmaking_rule_sets r on r.id=t.rule_set_id
    where t.state='searching' and (t.expires_at<=now() or t.heartbeat_at+make_interval(secs=>coalesce((r.wait_strategy->>'heartbeatTtlSeconds')::integer,90))<=now())
    for update of t skip locked
  )
  update public.matchmaking_tickets t set state='expired',closed_at=now(),cancel_reason='stale',updated_at=now(),version=version+1
    from stale where t.id=stale.id;
  get diagnostics v_rows=row_count;
  v_count:=v_count+v_rows;
  return v_count;
end;
$$;

create or replace function public.matchmaking_submit_feedback(
  p_pair_id uuid,p_user_id uuid,p_did_play boolean,p_rating text default null,
  p_want_again boolean default null,p_tags jsonb default '[]'::jsonb,p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_feedback public.matchmaking_feedback%rowtype; v_pair public.matchmaking_pairs%rowtype; v_total integer;
begin
  select * into v_pair from public.matchmaking_pairs where id=p_pair_id for update;
  if not found or p_user_id not in(v_pair.user_a_id,v_pair.user_b_id) then raise exception using errcode='42501',message='PAIR_FORBIDDEN'; end if;
  if v_pair.state<>'completed' then raise exception using errcode='P0001',message='MATCH_NOT_COMPLETED'; end if;
  insert into public.matchmaking_feedback(pair_id,user_id,did_play,rating,want_again,tags,note)
    values(p_pair_id,p_user_id,p_did_play,p_rating,p_want_again,coalesce(p_tags,'[]'),left(coalesce(p_note,''),500))
  on conflict(pair_id,user_id) do update set
    did_play=public.matchmaking_feedback.did_play or excluded.did_play,
    rating=coalesce(excluded.rating,public.matchmaking_feedback.rating),
    want_again=coalesce(excluded.want_again,public.matchmaking_feedback.want_again),
    tags=case when jsonb_array_length(excluded.tags)>0 then excluded.tags else public.matchmaking_feedback.tags end,
    note=case when excluded.note<>'' then excluded.note else public.matchmaking_feedback.note end,
    updated_at=now() returning * into v_feedback;
  select count(*) into v_total from public.matchmaking_feedback where pair_id=p_pair_id;
  if v_total=2 then
    update public.matchmaking_pairs set closed_at=coalesce(closed_at,now()),updated_at=now(),version=version+1 where id=p_pair_id;
    update public.matchmaking_tickets set closed_at=coalesce(closed_at,now()),updated_at=now(),version=version+1 where pair_id=p_pair_id;
  end if;
  return to_jsonb(v_feedback)||jsonb_build_object('closed',v_total=2);
end;
$$;

create or replace function public.matchmaking_sync_session_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_target text;
begin
  if new.status=old.status then return new; end if;
  v_target:=case new.status when 'playing' then 'playing' when 'completed' then 'completed' when 'cancelled' then 'cancelled' else null end;
  if v_target is null then return new; end if;
  update public.matchmaking_pairs set state=v_target,
    playing_at=case when v_target='playing' then coalesce(playing_at,now()) else playing_at end,
    completed_at=case when v_target='completed' then coalesce(completed_at,now()) else completed_at end,
    cancel_reason=case when v_target='cancelled' then coalesce(cancel_reason,new.completion_reason,'session_cancelled') else cancel_reason end,
    updated_at=now(),version=version+1 where session_id=new.id and state<>v_target;
  update public.matchmaking_tickets set state=v_target,
    playing_at=case when v_target='playing' then coalesce(playing_at,now()) else playing_at end,
    completed_at=case when v_target='completed' then coalesce(completed_at,now()) else completed_at end,
    updated_at=now(),version=version+1 where pair_id in(select id from public.matchmaking_pairs where session_id=new.id) and state<>v_target;
  perform public.matchmaking_log_transition(null,(select id from public.matchmaking_pairs where session_id=new.id),new.completed_by,old.status,v_target,'session_sync');
  return new;
end;
$$;
drop trigger if exists matchmaking_session_lifecycle_trigger on public.sessions;
create trigger matchmaking_session_lifecycle_trigger after update of status on public.sessions
  for each row execute function public.matchmaking_sync_session_lifecycle();

revoke all on function public.matchmaking_start_ticket(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.matchmaking_heartbeat(uuid) from public,anon,authenticated;
revoke all on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.matchmaking_present_pair(uuid) from public,anon,authenticated;
revoke all on function public.matchmaking_cancel_ticket(uuid,text,text) from public,anon,authenticated;
revoke all on function public.matchmaking_confirm_pair(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.matchmaking_expire_stale() from public,anon,authenticated;
revoke all on function public.matchmaking_submit_feedback(uuid,uuid,boolean,text,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.matchmaking_start_ticket(uuid,jsonb,text) to service_role;
grant execute on function public.matchmaking_heartbeat(uuid) to service_role;
grant execute on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.matchmaking_present_pair(uuid) to service_role;
grant execute on function public.matchmaking_cancel_ticket(uuid,text,text) to service_role;
grant execute on function public.matchmaking_confirm_pair(uuid,uuid,text,text) to service_role;
grant execute on function public.matchmaking_expire_stale() to service_role;
grant execute on function public.matchmaking_submit_feedback(uuid,uuid,boolean,text,boolean,jsonb,text) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.matchmaking_tickets;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.matchmaking_pairs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.matchmaking_confirmations;
exception when duplicate_object then null; end $$;
