-- Make Casual group reservation idempotent when the same user already has a
-- stale membership row in the target group under an older ticket.
--
-- This is an application idempotency fix. It does not suppress or reclassify
-- genuine PostgreSQL unique violations globally.

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

  -- The target group may already contain this user under an older ticket. The
  -- target group lock makes removing that stale duplicate and moving the
  -- current ticket a single serialized, idempotent operation.
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
