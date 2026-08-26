-- Matching V2 Minimal.
--
-- Reuses matchmaking_groups, matchmaking_group_members, rooms, room_members,
-- and sessions. Casual formation is represented by the existing group row plus
-- rooms.formation_state; no shadow V2 tables are introduced.

begin;

alter table public.rooms
  add column if not exists formation_state text null;

alter table public.rooms drop constraint if exists rooms_formation_state_check;
alter table public.rooms add constraint rooms_formation_state_check check (
  formation_state is null or formation_state in ('forming', 'backfilling', 'locked', 'formal')
);

alter table public.matchmaking_groups
  add column if not exists hard_max_players smallint not null default 6,
  add column if not exists recruitment_mode text not null default 'open';

update public.matchmaking_groups
   set hard_max_players = least(6, greatest(2, coalesce(desired_teammates, 1) + 1))
 where hard_max_players is null or hard_max_players = 6;

alter table public.matchmaking_groups drop constraint if exists matchmaking_groups_state_check;
alter table public.matchmaking_groups add constraint matchmaking_groups_state_check check (
  state in ('searching','partial_ready','forming','backfilling','locked',
            'waiting_confirmation','matched','playing','completed','cancelled','expired')
);

alter table public.matchmaking_groups drop constraint if exists matchmaking_groups_hard_max_players_check;
alter table public.matchmaking_groups add constraint matchmaking_groups_hard_max_players_check check (
  hard_max_players between 2 and 6
);

alter table public.matchmaking_groups drop constraint if exists matchmaking_groups_recruitment_mode_check;
alter table public.matchmaking_groups add constraint matchmaking_groups_recruitment_mode_check check (
  recruitment_mode in ('open', 'rush', 'fill')
);

create index if not exists matchmaking_group_forming_pool_idx
  on public.matchmaking_groups(game_id, state, created_at)
  where state in ('searching','partial_ready','forming','backfilling');

-- New casual groups start in the existing waiting pool. A Room is created only
-- after the first compatible teammate is reserved, so a one-person search does
-- not create a ghost Room.
create or replace function public.matchmaking_ensure_group(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_group public.matchmaking_groups%rowtype;
begin
  select * into v_ticket
    from public.matchmaking_tickets
   where id = p_ticket_id
   for update;

  if not found or v_ticket.mode <> 'casual' then
    raise exception using errcode = 'P0001', message = 'GROUP_MODE_REQUIRED';
  end if;

  if v_ticket.group_id is not null then
    select * into v_group from public.matchmaking_groups where id = v_ticket.group_id;
    return to_jsonb(v_group);
  end if;

  insert into public.matchmaking_groups(
    owner_user_id, game_id, mode, state, desired_teammates, min_teammates,
    hard_max_players, recruitment_mode, rule_set_id
  ) values (
    v_ticket.user_id, v_ticket.game_id, 'casual', 'searching',
    least(5, greatest(1, coalesce(v_ticket.desired_teammates, 1))),
    least(5, greatest(1, coalesce(v_ticket.min_teammates, 1))),
    6,
    case v_ticket.metadata->>'recruitmentMode'
      when 'rush' then 'rush'
      when 'fill' then 'fill'
      else 'open'
    end,
    v_ticket.rule_set_id
  ) returning * into v_group;

  insert into public.matchmaking_group_members(group_id, ticket_id, user_id, is_owner, decision)
    values (v_group.id, v_ticket.id, v_ticket.user_id, true, 'accepted');

  update public.matchmaking_tickets
     set group_id = v_group.id, updated_at = now(), version = version + 1
   where id = v_ticket.id;

  return to_jsonb(v_group);
end;
$$;

-- Materialize a forming group into the existing formal Room/Session lifecycle.
-- The locked state is recorded inside this transaction and then transitions to
-- matched, so clients never observe a half-created Session.
create or replace function public.matchmaking_lock_forming_group(
  p_group_id uuid,
  p_user_id uuid,
  p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_group public.matchmaking_groups%rowtype;
  v_room public.rooms%rowtype;
  v_session public.sessions%rowtype;
  v_member public.matchmaking_group_members%rowtype;
  v_count integer;
  v_players jsonb;
  v_need jsonb;
  v_code text;
  v_attempt integer := 0;
begin
  select * into v_group from public.matchmaking_groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'GROUP_NOT_FOUND';
  end if;
  if v_group.state in ('matched','playing','completed') then
    return to_jsonb(v_group);
  end if;
  if v_group.state = 'waiting_confirmation' then
    return to_jsonb(v_group);
  end if;

  select * into v_member
    from public.matchmaking_group_members
   where group_id = v_group.id
     and user_id = p_user_id
     and decision <> 'rejected'
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'GROUP_FORBIDDEN';
  end if;

  select count(*) into v_count
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';
  if v_count < 2 then
    raise exception using errcode = 'P0001', message = 'GROUP_MINIMUM_NOT_REACHED';
  end if;

  if v_group.room_id is null then
    select metadata into v_need
      from public.matchmaking_tickets
     where group_id = v_group.id and user_id = v_group.owner_user_id
     limit 1;
    v_need := coalesce(v_need, '{}'::jsonb)
      || jsonb_build_object('game', v_group.game_id, 'mode', 'casual',
                            'current', v_count, 'target', v_count,
                            'formationState', 'locked');

    loop
      v_attempt := v_attempt + 1;
      v_code := public.phase1_room_code();
      begin
        insert into public.rooms(code, need, status, formation_state)
          values (v_code, v_need, 'connecting', 'locked')
          returning * into v_room;
        exit;
      exception when unique_violation then
        if v_attempt >= 8 then raise; end if;
      end;
    end loop;
  else
    select * into v_room from public.rooms where id = v_group.room_id for update;
    v_need := coalesce(v_room.need, '{}'::jsonb)
      || jsonb_build_object('current', v_count, 'target', v_count,
                            'formationState', 'locked');
    update public.rooms
       set need = v_need, status = 'connecting', formation_state = 'locked'
     where id = v_room.id
     returning * into v_room;
  end if;

  insert into public.room_members(room_id, user_id, status)
    select v_room.id, user_id, 'active'
      from public.matchmaking_group_members
     where group_id = v_group.id and decision <> 'rejected'
  on conflict (room_id, user_id) do update
    set status = 'active', exited_at = null;

  select jsonb_agg(user_id::text order by joined_at)
    into v_players
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';

  insert into public.sessions(room_id, room_code, players, need, outcome_by, rematch_by, status)
    values (v_room.id, v_room.code, coalesce(v_players, '[]'::jsonb), v_need,
            '{}'::jsonb, '{}'::jsonb, 'ready')
    returning * into v_session;

  update public.rooms
     set status = 'ready', formation_state = 'formal', need = v_need
   where id = v_room.id;

  update public.matchmaking_groups
     set state = 'matched', room_id = v_room.id, session_id = v_session.id,
         updated_at = now(), version = version + 1
   where id = v_group.id
   returning * into v_group;

  update public.matchmaking_tickets
     set state = 'matched', matched_at = coalesce(matched_at, now()),
         updated_at = now(), version = version + 1
   where group_id = v_group.id and state in ('searching','candidate_found','waiting_confirmation');

  perform public.matchmaking_log_transition(
    null, null, p_user_id, 'locked', 'matched', 'forming_room_locked',
    p_request_id, jsonb_build_object('groupId', v_group.id, 'roomId', v_room.id)
  );

  return to_jsonb(v_group) || jsonb_build_object(
    'roomCode', v_room.code, 'sessionId', v_session.id,
    'formationState', 'formal'
  );
end;
$$;

-- Reserve one compatible casual ticket into an existing group. Counts and
-- membership are protected by the group row lock; the first reservation
-- creates the Room and later reservations only backfill it.
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
  if not found or v_group.id is null or v_group.owner_user_id = v_ticket.user_id
     or v_group.state not in ('searching','partial_ready','forming','backfilling')
     or v_ticket.state <> 'searching' or v_ticket.expires_at <= now() then
    raise exception using errcode = '40001', message = 'GROUP_RESERVATION_CONFLICT';
  end if;

  select count(*) into v_member_count
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';
  if v_member_count >= coalesce(v_group.hard_max_players, 6) then
    raise exception using errcode = '40001', message = 'GROUP_RESERVATION_CONFLICT';
  end if;

  -- Every starter has a one-person placeholder group. Absorb only that
  -- placeholder; a populated forming room is never silently merged.
  if v_ticket.group_id is not null and v_ticket.group_id <> v_group.id then
    select * into v_own_group from public.matchmaking_groups where id = v_ticket.group_id for update;
    if v_own_group.owner_user_id <> v_ticket.user_id
       or v_own_group.state not in ('searching','partial_ready','forming','backfilling')
       or (select count(*) from public.matchmaking_group_members
           where group_id = v_own_group.id and decision <> 'rejected') <> 1 then
      raise exception using errcode = '40001', message = 'GROUP_RESERVATION_CONFLICT';
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

  insert into public.matchmaking_group_members(group_id, ticket_id, user_id, is_owner, decision)
    values (v_group.id, v_ticket.id, v_ticket.user_id, false, 'accepted')
  on conflict (ticket_id) do update
    set group_id = excluded.group_id, decision = 'accepted', updated_at = now();

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

create or replace function public.matchmaking_start_group(
  p_group_id uuid, p_user_id uuid, p_request_id text default null
)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select public.matchmaking_lock_forming_group(p_group_id, p_user_id, p_request_id);
$$;

-- A forming-room leave is a normal lifecycle action: mark the member exited,
-- promote the next remaining member if the owner leaves, and keep the Room
-- available for backfill while any member remains.
create or replace function public.matchmaking_cancel_group(
  p_user_id uuid, p_reason text default 'user_cancelled', p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_group public.matchmaking_groups%rowtype;
  v_member public.matchmaking_group_members%rowtype;
  v_remaining integer;
  v_new_owner uuid;
begin
  select * into v_ticket
    from public.matchmaking_tickets
   where user_id = p_user_id and mode = 'casual'
     and state in ('searching','candidate_found','waiting_confirmation')
   order by created_at desc limit 1 for update;
  if not found or v_ticket.group_id is null then
    return public.matchmaking_cancel_ticket(p_user_id, p_reason, p_request_id);
  end if;

  select * into v_group from public.matchmaking_groups where id = v_ticket.group_id for update;
  if v_group.state in ('matched','playing','completed') then
    raise exception using errcode = 'P0001', message = 'MATCH_ALREADY_CONNECTED';
  end if;
  select * into v_member
    from public.matchmaking_group_members
   where group_id = v_group.id and user_id = p_user_id for update;

  update public.matchmaking_group_members
     set decision = 'rejected', responded_at = now(), updated_at = now()
   where id = v_member.id;
  update public.matchmaking_tickets
     set state = 'cancelled', group_id = null, closed_at = now(),
         cancel_reason = p_reason, updated_at = now(), version = version + 1
   where id = v_ticket.id returning * into v_ticket;

  if v_group.room_id is not null then
    update public.room_members
       set status = 'exited', exited_at = coalesce(exited_at, now())
     where room_id = v_group.room_id and user_id = p_user_id and status = 'active';
  end if;

  select count(*) into v_remaining
    from public.matchmaking_group_members
   where group_id = v_group.id and decision <> 'rejected';

  if v_remaining = 0 then
    update public.matchmaking_groups
       set state = 'cancelled', closed_at = now(), cancel_reason = p_reason,
           updated_at = now(), version = version + 1
     where id = v_group.id;
    if v_group.room_id is not null then
      update public.room_members
         set status = 'exited', exited_at = coalesce(exited_at, now())
       where room_id = v_group.room_id and status = 'active';
      update public.rooms
         set status = 'closed', formation_state = null, completed_at = coalesce(completed_at, now())
       where id = v_group.room_id and status in ('connecting','ready');
    end if;
  else
    select user_id into v_new_owner
      from public.matchmaking_group_members
     where group_id = v_group.id and decision <> 'rejected'
     order by joined_at asc limit 1;
    update public.matchmaking_groups
       set owner_user_id = case when owner_user_id = p_user_id then v_new_owner else owner_user_id end,
           state = case when room_id is null then 'searching' else 'backfilling' end,
           updated_at = now(), version = version + 1
     where id = v_group.id;
    update public.matchmaking_tickets
       set state = case when user_id = v_new_owner then 'searching' else 'candidate_found' end,
           updated_at = now(), version = version + 1
     where group_id = v_group.id and state in ('searching','candidate_found','waiting_confirmation');
    if v_group.room_id is not null then
      update public.rooms
         set need = coalesce(need, '{}'::jsonb) || jsonb_build_object('current', v_remaining),
             status = 'connecting', formation_state = 'backfilling'
       where id = v_group.room_id;
    end if;
  end if;

  return to_jsonb(v_ticket) || jsonb_build_object('groupId', v_group.id);
end;
$$;

grant execute on function public.matchmaking_lock_forming_group(uuid,uuid,text) to service_role;
grant execute on function public.matchmaking_start_group(uuid,uuid,text) to service_role;
grant execute on function public.matchmaking_ensure_group(uuid) to service_role;
grant execute on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.matchmaking_cancel_group(uuid,text,text) to service_role;

commit;
