-- Matching conflict contract + durable runtime telemetry.
--
-- This is a forward-only migration. It is intentionally not executed against
-- Production by this change. Business contention is returned as committed
-- JSON; only genuine PostgreSQL serialization failures may surface SQLSTATE
-- 40001 from the database.

begin;

alter table public.matchmaking_tickets
  add column if not exists last_match_attempt_at timestamptz null,
  add column if not exists next_match_attempt_at timestamptz null,
  add column if not exists last_match_outcome text null,
  add column if not exists last_match_target_id uuid null,
  add column if not exists consecutive_conflicts integer not null default 0;

create index if not exists matchmaking_eligible_ticket_idx
  on public.matchmaking_tickets (game_id, mode, next_match_attempt_at, search_started_at)
  where state = 'searching';

-- A real state transition into the searching pool wakes a ticket immediately.
-- Heartbeats and telemetry updates do not touch these trigger columns, so they
-- cannot turn the persistent matcher back into a one-second polling loop.
create or replace function public.matchmaking_wake_search_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.next_match_attempt_at := null;
    new.last_match_outcome := 'AWAKENED';
    new.last_match_target_id := null;
    new.consecutive_conflicts := 0;
  elsif new.state = 'searching' and (
    old.state is distinct from new.state
    or old.group_id is distinct from new.group_id
    or old.pair_id is distinct from new.pair_id
  ) then
    new.next_match_attempt_at := null;
    new.last_match_outcome := 'AWAKENED';
    new.last_match_target_id := null;
    new.consecutive_conflicts := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists matchmaking_wake_search_ticket_trigger on public.matchmaking_tickets;
create trigger matchmaking_wake_search_ticket_trigger
  before insert or update of state, group_id, pair_id on public.matchmaking_tickets
  for each row execute function public.matchmaking_wake_search_ticket();

-- V2's later migration had accidentally restored the old exception contract
-- for groups. Keep the existing pair/group/room lifecycle, but classify every
-- normal reservation miss as a typed business result.
create or replace function public.matchmaking_reserve_pair(
  p_ticket_a uuid,
  p_ticket_b uuid,
  p_hard_snapshot jsonb,
  p_soft_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.matchmaking_tickets%rowtype;
  v_b public.matchmaking_tickets%rowtype;
  v_pair public.matchmaking_pairs%rowtype;
  v_ttl integer;
begin
  perform 1 from public.matchmaking_tickets where id in (p_ticket_a, p_ticket_b) order by id for update;
  select * into v_a from public.matchmaking_tickets where id = p_ticket_a;
  select * into v_b from public.matchmaking_tickets where id = p_ticket_b;
  if v_a.id is null or v_b.id is null
     or v_a.state <> 'searching' or v_b.state <> 'searching'
     or v_a.user_id = v_b.user_id then
    return jsonb_build_object('ok', false, 'reason', 'MATCH_RESERVATION_CONFLICT',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_a.expires_at <= now() or v_b.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'STALE_CANDIDATE',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  v_ttl := coalesce((select (wait_strategy->>'confirmationTtlSeconds')::integer
    from public.matchmaking_rule_sets where id = v_a.rule_set_id), 45);
  insert into public.matchmaking_pairs(
    ticket_a_id, ticket_b_id, user_a_id, user_b_id, state, rule_set_id,
    hard_rule_snapshot, soft_preference_snapshot, confirmation_deadline
  ) values (
    v_a.id, v_b.id, v_a.user_id, v_b.user_id, 'candidate_found', v_a.rule_set_id,
    coalesce(p_hard_snapshot, '{}'::jsonb), coalesce(p_soft_snapshot, '{}'::jsonb),
    now() + make_interval(secs => v_ttl)
  ) returning * into v_pair;
  insert into public.matchmaking_confirmations(pair_id, user_id) values
    (v_pair.id, v_a.user_id), (v_pair.id, v_b.user_id);
  update public.matchmaking_tickets
     set state = 'candidate_found', pair_id = v_pair.id,
         confirmation_deadline = v_pair.confirmation_deadline,
         updated_at = now(), version = version + 1
   where id in (v_a.id, v_b.id);
  perform public.matchmaking_log_transition(v_a.id, v_pair.id, null, 'searching', 'candidate_found', 'reserved');
  perform public.matchmaking_log_transition(v_b.id, v_pair.id, null, 'searching', 'candidate_found', 'reserved');
  return to_jsonb(v_pair) || jsonb_build_object('classification', 'MATCHING_SUCCESS');
end;
$$;

revoke all on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.matchmaking_reserve_group_member(
  p_group_id uuid,
  p_ticket_id uuid,
  p_hard_snapshot jsonb default '{}'::jsonb,
  p_soft_snapshot jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_group public.matchmaking_groups%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_own_group public.matchmaking_groups%rowtype;
  v_room public.rooms%rowtype;
  v_owner_metadata jsonb;
  v_need jsonb;
  v_member_count integer;
  v_code text;
  v_attempt integer := 0;
  v_result jsonb;
begin
  select * into v_group from public.matchmaking_groups where id = p_group_id for update;
  select * into v_ticket from public.matchmaking_tickets where id = p_ticket_id for update;

  if v_group.id is null then
    return jsonb_build_object('ok', false, 'reason', 'STALE_CANDIDATE',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_group.state = 'locked' or v_group.room_id is not null and v_group.state not in ('searching','partial_ready','forming','backfilling') then
    return jsonb_build_object('ok', false, 'reason', 'ROOM_LOCKED',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_group.state not in ('searching','partial_ready','forming','backfilling') then
    return jsonb_build_object('ok', false, 'reason', 'TICKET_STATE_CHANGED',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_ticket.id is null or v_ticket.mode <> 'casual'
     or v_ticket.user_id = v_group.owner_user_id
     or v_ticket.state <> 'searching' then
    return jsonb_build_object('ok', false, 'reason', 'TICKET_STATE_CHANGED',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_ticket.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'STALE_CANDIDATE',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;

  select count(*) into v_member_count
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';
  if v_member_count >= coalesce(v_group.hard_max_players, 6) then
    return jsonb_build_object('ok', false, 'reason', 'GROUP_FULL',
      'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;

  -- Every starter has a one-person placeholder group. Absorb only that
  -- placeholder; a populated forming room is never silently merged.
  if v_ticket.group_id is not null and v_ticket.group_id <> v_group.id then
    select * into v_own_group from public.matchmaking_groups where id = v_ticket.group_id for update;
    if v_own_group.owner_user_id <> v_ticket.user_id
       or v_own_group.state not in ('searching','partial_ready','forming','backfilling')
       or (select count(*) from public.matchmaking_group_members
           where group_id = v_own_group.id and decision <> 'rejected') <> 1 then
      return jsonb_build_object('ok', false, 'reason', 'TICKET_CHANGED',
        'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
    end if;
    if v_own_group.room_id is not null then
      update public.room_members
         set status = 'exited', exited_at = coalesce(exited_at, now())
       where room_id = v_own_group.room_id and status = 'active';
      update public.rooms
         set status = 'closed', formation_state = null, completed_at = coalesce(completed_at, now())
       where id = v_own_group.room_id and status in ('connecting','ready');
    end if;
    update public.matchmaking_groups
       set state = 'cancelled', closed_at = now(), cancel_reason = 'absorbed',
           updated_at = now(), version = version + 1
     where id = v_own_group.id;
  end if;

  -- A user can already have a stale membership in this target group from an
  -- older ticket while the current ticket still owns its placeholder group.
  -- Normalize that duplicate before moving the current ticket. The group row
  -- lock above serializes concurrent joins into the same target group.
  delete from public.matchmaking_group_members
   where group_id = v_group.id
     and user_id = v_ticket.user_id
     and ticket_id <> v_ticket.id;

  insert into public.matchmaking_group_members(group_id, ticket_id, user_id, is_owner, decision)
    values (v_group.id, v_ticket.id, v_ticket.user_id, false, 'accepted')
  on conflict (ticket_id) do update
    set group_id = excluded.group_id, user_id = excluded.user_id,
        is_owner = false, decision = 'accepted', updated_at = now();

  update public.matchmaking_tickets
     set group_id = v_group.id, state = 'candidate_found',
         confirmation_deadline = null, updated_at = now(), version = version + 1
   where id = v_ticket.id;

  select count(*) into v_member_count
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';

  if v_group.room_id is null then
    select metadata into v_owner_metadata
      from public.matchmaking_tickets
     where group_id = v_group.id and user_id = v_group.owner_user_id
     limit 1;
    v_need := coalesce(v_owner_metadata, '{}'::jsonb)
      || jsonb_build_object('game', v_group.game_id, 'mode', 'casual',
                            'current', v_member_count,
                            'target', coalesce(v_group.hard_max_players, 6),
                            'formationState', 'forming');
    loop
      v_attempt := v_attempt + 1;
      v_code := public.phase1_room_code();
      begin
        insert into public.rooms(code, need, status, formation_state)
          values (v_code, v_need, 'connecting', 'forming')
          returning * into v_room;
        exit;
      exception when unique_violation then
        if v_attempt >= 8 then raise; end if;
      end;
    end loop;
    insert into public.room_members(room_id, user_id, status)
      select v_room.id, user_id, 'active'
        from public.matchmaking_group_members
       where group_id = v_group.id and decision <> 'rejected'
    on conflict (room_id, user_id) do update
      set status = 'active', exited_at = null;
    update public.matchmaking_groups
       set room_id = v_room.id, state = 'forming', updated_at = now(), version = version + 1
     where id = v_group.id returning * into v_group;
  else
    select * into v_room from public.rooms where id = v_group.room_id for update;
    update public.room_members
       set status = 'active', exited_at = null
     where room_id = v_room.id and user_id = v_ticket.user_id;
    insert into public.room_members(room_id, user_id, status)
      values (v_room.id, v_ticket.user_id, 'active')
    on conflict (room_id, user_id) do update set status = 'active', exited_at = null;
    update public.rooms
       set need = coalesce(need, '{}'::jsonb)
           || jsonb_build_object('current', v_member_count,
                                 'formationState', 'backfilling'),
           status = 'connecting', formation_state = 'backfilling'
     where id = v_room.id;
    update public.matchmaking_groups
       set state = 'backfilling', updated_at = now(), version = version + 1
     where id = v_group.id returning * into v_group;
  end if;

  perform public.matchmaking_log_transition(
    v_ticket.id, null, v_ticket.user_id, 'searching', 'candidate_found',
    'forming_room_member_reserved', null,
    jsonb_build_object('groupId', v_group.id, 'roomId', v_group.room_id,
                       'hard', coalesce(p_hard_snapshot, '{}'::jsonb),
                       'soft', coalesce(p_soft_snapshot, '{}'::jsonb))
  );

  if v_member_count >= coalesce(v_group.hard_max_players, 6) then
    select public.matchmaking_lock_forming_group(v_group.id, v_group.owner_user_id, null)
      into v_result;
    return v_result;
  end if;

  return to_jsonb(v_group) || jsonb_build_object(
    'roomCode', (select code from public.rooms where id = v_group.room_id),
    'formationState', case when v_group.state = 'forming' then 'forming' else 'backfilling' end
  );
end;
$$;

revoke all on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) to service_role;

create table if not exists public.matchmaking_runtime_instances (
  instance_id text primary key,
  process_id text not null,
  container_id text null,
  run_id text not null default 'production',
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  status text not null default 'alive' check (status in ('alive','stopped','unknown')),
  is_leader boolean not null default false,
  ticks_per_minute bigint not null default 0,
  tickets_per_minute bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.matchmaking_runtime_lease (
  lease_name text primary key,
  owner_instance_id text null,
  lease_until timestamptz null,
  heartbeat_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.matchmaking_runtime_lease(lease_name)
values ('persistent_matcher')
on conflict (lease_name) do nothing;

create table if not exists public.matchmaking_runtime_minute (
  minute_start timestamptz not null,
  instance_id text not null references public.matchmaking_runtime_instances(instance_id) on delete cascade,
  run_id text not null default 'production',
  matcher_ticks bigint not null default 0,
  matcher_active_ticks bigint not null default 0,
  searching_tickets bigint not null default 0,
  eligible_tickets bigint not null default 0,
  tickets_processed bigint not null default 0,
  unique_tickets_processed bigint not null default 0,
  pair_attempts bigint not null default 0,
  pair_success bigint not null default 0,
  pair_business_conflicts bigint not null default 0,
  group_attempts bigint not null default 0,
  group_success bigint not null default 0,
  group_business_conflicts bigint not null default 0,
  forming_rooms bigint not null default 0,
  backfill_attempts bigint not null default 0,
  backfill_success bigint not null default 0,
  stale_candidate bigint not null default 0,
  group_full bigint not null default 0,
  room_locked bigint not null default 0,
  actual_sql_40001 bigint not null default 0,
  database_errors bigint not null default 0,
  transaction_timeouts bigint not null default 0,
  matcher_retries bigint not null default 0,
  matcher_backoffs bigint not null default 0,
  same_target_suppressed bigint not null default 0,
  duplicate_prevented bigint not null default 0,
  compatible_searching_stuck bigint not null default 0,
  circuit_breaker_trips bigint not null default 0,
  time_to_first_match_sum_ms numeric not null default 0,
  time_to_first_match_count bigint not null default 0,
  time_to_pair_sum_ms numeric not null default 0,
  time_to_pair_count bigint not null default 0,
  time_to_forming_room_sum_ms numeric not null default 0,
  time_to_forming_room_count bigint not null default 0,
  backfill_latency_sum_ms numeric not null default 0,
  backfill_latency_count bigint not null default 0,
  matchmaking_start_sum_ms numeric not null default 0,
  matchmaking_start_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (minute_start, instance_id)
);

create table if not exists public.matchmaking_runtime_events (
  id bigint generated always as identity primary key,
  run_id text not null default 'production',
  matcher_instance_id text not null,
  tick_id text null,
  ticket_id uuid null,
  group_id uuid null,
  room_id uuid null,
  candidate_id uuid null,
  operation text not null,
  outcome text not null,
  reason_code text null,
  attempt_number integer null,
  cooldown_ms integer null,
  latency_ms integer null,
  occurred_at timestamptz not null default now()
);

create index if not exists matchmaking_runtime_events_time_idx
  on public.matchmaking_runtime_events (occurred_at desc);

alter table public.matchmaking_runtime_instances enable row level security;
alter table public.matchmaking_runtime_lease enable row level security;
alter table public.matchmaking_runtime_minute enable row level security;
alter table public.matchmaking_runtime_events enable row level security;
revoke all on public.matchmaking_runtime_instances, public.matchmaking_runtime_lease,
  public.matchmaking_runtime_minute, public.matchmaking_runtime_events from public, anon, authenticated;
grant select, insert, update on public.matchmaking_runtime_instances to service_role;
grant select, insert, update on public.matchmaking_runtime_lease to service_role;
grant select, insert, update on public.matchmaking_runtime_minute to service_role;
grant select, insert on public.matchmaking_runtime_events to service_role;

create or replace function public.matchmaking_claim_matcher_lease(
  p_instance_id text,
  p_process_id text,
  p_container_id text default null,
  p_run_id text default 'production',
  p_lease_seconds integer default 15
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lease public.matchmaking_runtime_lease%rowtype;
  v_leader boolean := false;
  v_alive integer;
begin
  insert into public.matchmaking_runtime_lease(lease_name)
  values ('persistent_matcher')
  on conflict (lease_name) do nothing;

  select * into v_lease
    from public.matchmaking_runtime_lease
   where lease_name = 'persistent_matcher'
   for update;

  if v_lease.owner_instance_id is null
     or v_lease.lease_until is null
     or v_lease.lease_until <= now()
     or v_lease.owner_instance_id = p_instance_id then
    v_leader := true;
    update public.matchmaking_runtime_lease
       set owner_instance_id = p_instance_id,
           lease_until = now() + make_interval(secs => greatest(5, least(p_lease_seconds, 60))),
           heartbeat_at = now(), updated_at = now()
     where lease_name = 'persistent_matcher';
  end if;

  insert into public.matchmaking_runtime_instances(
    instance_id, process_id, container_id, run_id, started_at,
    last_heartbeat_at, status, is_leader, updated_at
  ) values (
    p_instance_id, p_process_id, p_container_id, coalesce(p_run_id, 'production'), now(),
    now(), 'alive', v_leader, now()
  )
  on conflict (instance_id) do update set
    process_id = excluded.process_id,
    container_id = excluded.container_id,
    run_id = excluded.run_id,
    last_heartbeat_at = now(),
    status = 'alive',
    is_leader = v_leader,
    updated_at = now();

  select count(*) into v_alive
    from public.matchmaking_runtime_instances
   where last_heartbeat_at >= now() - interval '20 seconds'
     and status = 'alive';

  return jsonb_build_object(
    'leader', v_leader,
    'owner_instance_id', (select owner_instance_id from public.matchmaking_runtime_lease where lease_name = 'persistent_matcher'),
    'alive_instances', coalesce(v_alive, 0),
    'lease_until', (select lease_until from public.matchmaking_runtime_lease where lease_name = 'persistent_matcher')
  );
end;
$$;

create or replace function public.matchmaking_flush_runtime(
  p_instance_id text,
  p_process_id text,
  p_container_id text default null,
  p_started_at timestamptz default now(),
  p_minute_start timestamptz default date_trunc('minute', now()),
  p_leader boolean default false,
  p_run_id text default 'production',
  p_snapshot jsonb default '{}'::jsonb,
  p_events jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_events jsonb := case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end;
begin
  insert into public.matchmaking_runtime_instances(
    instance_id, process_id, container_id, run_id, started_at,
    last_heartbeat_at, status, is_leader, ticks_per_minute,
    tickets_per_minute, updated_at
  ) values (
    p_instance_id, p_process_id, p_container_id, coalesce(p_run_id, 'production'), coalesce(p_started_at, now()),
    now(), 'alive', coalesce(p_leader, false),
    coalesce((v_snapshot->>'matcher_ticks')::bigint, 0),
    coalesce((v_snapshot->>'tickets_processed')::bigint, 0), now()
  )
  on conflict (instance_id) do update set
    process_id = excluded.process_id,
    container_id = excluded.container_id,
    run_id = excluded.run_id,
    last_heartbeat_at = now(),
    status = 'alive',
    is_leader = excluded.is_leader,
    ticks_per_minute = excluded.ticks_per_minute,
    tickets_per_minute = excluded.tickets_per_minute,
    updated_at = now();

  insert into public.matchmaking_runtime_minute(
    minute_start, instance_id, run_id, matcher_ticks, matcher_active_ticks,
    searching_tickets, eligible_tickets, tickets_processed, unique_tickets_processed,
    pair_attempts, pair_success, pair_business_conflicts, group_attempts, group_success,
    group_business_conflicts, forming_rooms, backfill_attempts, backfill_success,
    stale_candidate, group_full, room_locked, actual_sql_40001, database_errors,
    transaction_timeouts, matcher_retries, matcher_backoffs, same_target_suppressed,
    duplicate_prevented, compatible_searching_stuck, circuit_breaker_trips,
    time_to_first_match_sum_ms,
    time_to_first_match_count, time_to_pair_sum_ms, time_to_pair_count,
    time_to_forming_room_sum_ms, time_to_forming_room_count, backfill_latency_sum_ms,
    backfill_latency_count, matchmaking_start_sum_ms, matchmaking_start_count, updated_at
  ) values (
    p_minute_start, p_instance_id, coalesce(p_run_id, 'production'),
    coalesce((v_snapshot->>'matcher_ticks')::bigint, 0),
    coalesce((v_snapshot->>'matcher_active_ticks')::bigint, 0),
    coalesce((v_snapshot->>'searching_tickets')::bigint, 0),
    coalesce((v_snapshot->>'eligible_tickets')::bigint, 0),
    coalesce((v_snapshot->>'tickets_processed')::bigint, 0),
    coalesce((v_snapshot->>'unique_tickets_processed')::bigint, 0),
    coalesce((v_snapshot->>'pair_attempts')::bigint, 0),
    coalesce((v_snapshot->>'pair_success')::bigint, 0),
    coalesce((v_snapshot->>'pair_business_conflicts')::bigint, 0),
    coalesce((v_snapshot->>'group_attempts')::bigint, 0),
    coalesce((v_snapshot->>'group_success')::bigint, 0),
    coalesce((v_snapshot->>'group_business_conflicts')::bigint, 0),
    coalesce((v_snapshot->>'forming_rooms')::bigint, 0),
    coalesce((v_snapshot->>'backfill_attempts')::bigint, 0),
    coalesce((v_snapshot->>'backfill_success')::bigint, 0),
    coalesce((v_snapshot->>'stale_candidate')::bigint, 0),
    coalesce((v_snapshot->>'group_full')::bigint, 0),
    coalesce((v_snapshot->>'room_locked')::bigint, 0),
    coalesce((v_snapshot->>'actual_sql_40001')::bigint, 0),
    coalesce((v_snapshot->>'database_errors')::bigint, 0),
    coalesce((v_snapshot->>'transaction_timeouts')::bigint, 0),
    coalesce((v_snapshot->>'matcher_retries')::bigint, 0),
    coalesce((v_snapshot->>'matcher_backoffs')::bigint, 0),
    coalesce((v_snapshot->>'same_target_suppressed')::bigint, 0),
    coalesce((v_snapshot->>'duplicate_prevented')::bigint, 0),
    coalesce((v_snapshot->>'compatible_searching_stuck')::bigint, 0),
    coalesce((v_snapshot->>'circuit_breaker_trips')::bigint, 0),
    coalesce((v_snapshot->'latency_totals'->>'time_to_first_match')::numeric, 0),
    coalesce((v_snapshot->'latency_counts'->>'time_to_first_match')::bigint, 0),
    coalesce((v_snapshot->'latency_totals'->>'time_to_pair')::numeric, 0),
    coalesce((v_snapshot->'latency_counts'->>'time_to_pair')::bigint, 0),
    coalesce((v_snapshot->'latency_totals'->>'time_to_forming_room')::numeric, 0),
    coalesce((v_snapshot->'latency_counts'->>'time_to_forming_room')::bigint, 0),
    coalesce((v_snapshot->'latency_totals'->>'backfill_latency')::numeric, 0),
    coalesce((v_snapshot->'latency_counts'->>'backfill_latency')::bigint, 0),
    coalesce((v_snapshot->'latency_totals'->>'matchmaking_start')::numeric, 0),
    coalesce((v_snapshot->'latency_counts'->>'matchmaking_start')::bigint, 0), now()
  )
  on conflict (minute_start, instance_id) do update set
    run_id = excluded.run_id,
    matcher_ticks = excluded.matcher_ticks,
    matcher_active_ticks = excluded.matcher_active_ticks,
    searching_tickets = excluded.searching_tickets,
    eligible_tickets = excluded.eligible_tickets,
    tickets_processed = excluded.tickets_processed,
    unique_tickets_processed = excluded.unique_tickets_processed,
    pair_attempts = excluded.pair_attempts,
    pair_success = excluded.pair_success,
    pair_business_conflicts = excluded.pair_business_conflicts,
    group_attempts = excluded.group_attempts,
    group_success = excluded.group_success,
    group_business_conflicts = excluded.group_business_conflicts,
    forming_rooms = excluded.forming_rooms,
    backfill_attempts = excluded.backfill_attempts,
    backfill_success = excluded.backfill_success,
    stale_candidate = excluded.stale_candidate,
    group_full = excluded.group_full,
    room_locked = excluded.room_locked,
    actual_sql_40001 = excluded.actual_sql_40001,
    database_errors = excluded.database_errors,
    transaction_timeouts = excluded.transaction_timeouts,
    matcher_retries = excluded.matcher_retries,
    matcher_backoffs = excluded.matcher_backoffs,
    same_target_suppressed = excluded.same_target_suppressed,
    duplicate_prevented = excluded.duplicate_prevented,
    compatible_searching_stuck = excluded.compatible_searching_stuck,
    circuit_breaker_trips = excluded.circuit_breaker_trips,
    time_to_first_match_sum_ms = excluded.time_to_first_match_sum_ms,
    time_to_first_match_count = excluded.time_to_first_match_count,
    time_to_pair_sum_ms = excluded.time_to_pair_sum_ms,
    time_to_pair_count = excluded.time_to_pair_count,
    time_to_forming_room_sum_ms = excluded.time_to_forming_room_sum_ms,
    time_to_forming_room_count = excluded.time_to_forming_room_count,
    backfill_latency_sum_ms = excluded.backfill_latency_sum_ms,
    backfill_latency_count = excluded.backfill_latency_count,
    matchmaking_start_sum_ms = excluded.matchmaking_start_sum_ms,
    matchmaking_start_count = excluded.matchmaking_start_count,
    updated_at = now();

  insert into public.matchmaking_runtime_events(
    run_id, matcher_instance_id, tick_id, ticket_id, group_id, room_id,
    candidate_id, operation, outcome, reason_code, attempt_number,
    cooldown_ms, latency_ms, occurred_at
  )
  select
    coalesce(nullif(event->>'runId', ''), coalesce(p_run_id, 'production')),
    p_instance_id,
    nullif(event->>'tickId', ''),
    nullif(event->>'ticketId', '')::uuid,
    nullif(event->>'groupId', '')::uuid,
    nullif(event->>'roomId', '')::uuid,
    nullif(event->>'candidateId', '')::uuid,
    coalesce(event->>'operation', 'unknown'),
    coalesce(event->>'outcome', 'unknown'),
    nullif(event->>'reasonCode', ''),
    nullif(event->>'attemptNumber', '')::integer,
    nullif(event->>'cooldownMs', '')::integer,
    nullif(event->>'latencyMs', '')::integer,
    coalesce(nullif(event->>'timestamp', '')::timestamptz, now())
  from jsonb_array_elements(v_events) as event;

  return jsonb_build_object('ok', true, 'minute_start', p_minute_start);
end;
$$;

revoke all on function public.matchmaking_claim_matcher_lease(text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.matchmaking_claim_matcher_lease(text,text,text,text,integer) to service_role;
revoke all on function public.matchmaking_flush_runtime(text,text,text,timestamptz,timestamptz,boolean,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.matchmaking_flush_runtime(text,text,text,timestamptz,timestamptz,boolean,text,jsonb,jsonb) to service_role;

commit;
