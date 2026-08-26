-- Room-first matchmaking: a player enters one shared Room immediately, then
-- recruitment continues inside that Room. Existing pair/group tables remain
-- the concurrency and lifecycle source of truth.

begin;

alter table public.matchmaking_tickets
  add column if not exists room_id uuid null references public.rooms(id) on delete set null;

create index if not exists matchmaking_tickets_room_id_idx
  on public.matchmaking_tickets(room_id) where room_id is not null;

create or replace function public.matchmaking_create_waiting_room(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_room public.rooms%rowtype;
  v_code text;
  v_attempt integer := 0;
  v_target integer;
begin
  select * into v_ticket from public.matchmaking_tickets where id = p_ticket_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'TICKET_NOT_FOUND'; end if;
  if v_ticket.room_id is not null then
    select * into v_room from public.rooms where id = v_ticket.room_id;
    if found and v_room.status in ('connecting','ready','playing') then return to_jsonb(v_room); end if;
  end if;
  v_target := case when v_ticket.mode = 'casual' then least(6, greatest(2, coalesce(v_ticket.desired_teammates, 1) + 1)) else 2 end;
  loop
    v_attempt := v_attempt + 1;
    v_code := public.phase1_room_code();
    begin
      insert into public.rooms(code, need, status, formation_state)
        values (v_code,
          coalesce(v_ticket.metadata, '{}'::jsonb) || jsonb_build_object(
            'game', v_ticket.game_id, 'mode', v_ticket.mode, 'current', 1,
            'target', v_target, 'formationState', 'forming'),
          'connecting', 'forming')
        returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;
  insert into public.room_members(room_id, user_id, status)
    values (v_room.id, v_ticket.user_id, 'active')
  on conflict (room_id, user_id) do update set status = 'active', exited_at = null;
  update public.matchmaking_tickets
     set room_id = v_room.id, updated_at = now(), version = version + 1
   where id = v_ticket.id;
  return to_jsonb(v_room);
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
  v_target smallint;
  v_min smallint;
  v_room jsonb;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  select * into v_existing from public.matchmaking_tickets
    where user_id = p_user_id and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
    order by created_at desc limit 1 for update;
  if found then return to_jsonb(v_existing) || jsonb_build_object('reused', true); end if;
  select * into v_rules from public.matchmaking_rule_sets
    where game_id = coalesce(nullif(p_input->>'gameId',''),'deadlock') and active limit 1;
  if not found then raise exception using errcode='P0001', message='MATCH_RULE_SET_MISSING'; end if;
  v_ttl := coalesce((v_rules.wait_strategy->>'ticketTtlSeconds')::integer,1800);
  v_target := case when p_input->>'mode' = 'casual' then least(5, greatest(1, coalesce((p_input->>'desiredTeammates')::integer, 1))) else 1 end;
  v_min := case when p_input->>'mode' = 'casual' then least(v_target, greatest(1, coalesce((p_input->>'minTeammates')::integer, v_target))) else 1 end;
  insert into public.matchmaking_tickets(
    user_id,game_id,mode,rank_code,desired_roles,microphone_preference,
    desired_teammates,min_teammates,state,rule_set_id,request_id,metadata,expires_at
  ) values (
    p_user_id,v_rules.game_id,p_input->>'mode',nullif(p_input->>'rankCode',''),
    array(select jsonb_array_elements_text(coalesce(p_input->'desiredRoles','[]'::jsonb))::smallint),
    coalesce(nullif(p_input->>'microphonePreference',''),'any'),
    v_target,v_min,'searching',v_rules.id,nullif(p_request_id,''),coalesce(p_input,'{}'::jsonb),now()+make_interval(secs=>v_ttl)
  ) returning * into v_ticket;
  v_room := public.matchmaking_create_waiting_room(v_ticket.id);
  select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
  perform public.matchmaking_log_transition(v_ticket.id,null,p_user_id,'idle','searching','room_first_start',p_request_id,
    jsonb_build_object('roomId', v_ticket.room_id));
  return to_jsonb(v_ticket) || jsonb_build_object('reused', false, 'roomCode', v_room->>'code');
end;
$$;

create or replace function public.matchmaking_ensure_group(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
  v_group public.matchmaking_groups%rowtype;
  v_room jsonb;
begin
  select * into v_ticket from public.matchmaking_tickets where id = p_ticket_id for update;
  if not found or v_ticket.mode <> 'casual' then raise exception using errcode = 'P0001', message = 'GROUP_MODE_REQUIRED'; end if;
  if v_ticket.group_id is null then
    insert into public.matchmaking_groups(owner_user_id, game_id, mode, state, desired_teammates, min_teammates, hard_max_players, recruitment_mode, rule_set_id)
    values (v_ticket.user_id, v_ticket.game_id, 'casual', 'forming',
      least(5, greatest(1, coalesce(v_ticket.desired_teammates, 1))),
      least(5, greatest(1, coalesce(v_ticket.min_teammates, 1))), 6,
      case v_ticket.metadata->>'recruitmentMode' when 'rush' then 'rush' when 'fill' then 'fill' else 'open' end,
      v_ticket.rule_set_id)
    returning * into v_group;
    insert into public.matchmaking_group_members(group_id, ticket_id, user_id, is_owner, decision)
      values (v_group.id, v_ticket.id, v_ticket.user_id, true, 'accepted');
    update public.matchmaking_tickets set group_id = v_group.id, updated_at = now(), version = version + 1 where id = v_ticket.id;
  else
    select * into v_group from public.matchmaking_groups where id = v_ticket.group_id for update;
  end if;
  v_room := public.matchmaking_create_waiting_room(v_ticket.id);
  update public.matchmaking_groups
     set room_id = (v_room->>'id')::uuid, state = case when state in ('searching','partial_ready') then 'forming' else state end,
         updated_at = now(), version = version + 1
   where id = v_group.id returning * into v_group;
  return to_jsonb(v_group) || jsonb_build_object('roomCode', v_room->>'code', 'formationState', 'forming');
end;
$$;

create or replace function public.matchmaking_reserve_pair(
  p_ticket_a uuid, p_ticket_b uuid, p_hard_snapshot jsonb, p_soft_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.matchmaking_tickets%rowtype;
  v_b public.matchmaking_tickets%rowtype;
  v_pair public.matchmaking_pairs%rowtype;
  v_room public.rooms%rowtype;
  v_other_room_id uuid;
  v_session public.sessions%rowtype;
  v_room_json jsonb;
  v_need jsonb;
begin
  perform 1 from public.matchmaking_tickets where id in (p_ticket_a, p_ticket_b) order by id for update;
  select * into v_a from public.matchmaking_tickets where id = p_ticket_a;
  select * into v_b from public.matchmaking_tickets where id = p_ticket_b;
  if v_a.id is null or v_b.id is null or v_a.state <> 'searching' or v_b.state <> 'searching' or v_a.user_id = v_b.user_id then
    return jsonb_build_object('ok', false, 'reason', 'MATCH_RESERVATION_CONFLICT', 'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  if v_a.expires_at <= now() or v_b.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'STALE_CANDIDATE', 'classification', 'MATCHING_BUSINESS_CONFLICT', 'retryable', true);
  end if;
  v_room_json := public.matchmaking_create_waiting_room(v_a.id);
  select * into v_room from public.rooms where id = (v_room_json->>'id')::uuid for update;
  v_other_room_id := v_b.room_id;
  if v_other_room_id is not null and v_other_room_id <> v_room.id then
    update public.room_members set status='exited', exited_at=coalesce(exited_at,now()) where room_id=v_other_room_id and status='active';
    update public.rooms set status='closed', formation_state=null, completed_at=coalesce(completed_at,now()) where id=v_other_room_id and status in ('connecting','ready');
  end if;
  v_need := coalesce(v_room.need, '{}'::jsonb) || jsonb_build_object('game', v_a.game_id, 'mode', 'ranked', 'current', 2, 'target', 2, 'formationState', 'formal');
  insert into public.room_members(room_id,user_id,status) values (v_room.id,v_a.user_id,'active'), (v_room.id,v_b.user_id,'active')
    on conflict (room_id,user_id) do update set status='active', exited_at=null;
  insert into public.sessions(room_id,room_code,players,need,outcome_by,rematch_by,status)
    values(v_room.id,v_room.code,jsonb_build_array(v_a.user_id::text,v_b.user_id::text),v_need,'{}','{}','ready') returning * into v_session;
  insert into public.matchmaking_pairs(ticket_a_id,ticket_b_id,user_a_id,user_b_id,state,rule_set_id,hard_rule_snapshot,soft_preference_snapshot,confirmation_deadline,room_id,session_id,matched_at)
    values(v_a.id,v_b.id,v_a.user_id,v_b.user_id,'matched',v_a.rule_set_id,coalesce(p_hard_snapshot,'{}'::jsonb),coalesce(p_soft_snapshot,'{}'::jsonb),now(),v_room.id,v_session.id,now())
    returning * into v_pair;
  update public.rooms set need=v_need,status='ready',formation_state='formal' where id=v_room.id;
  update public.matchmaking_tickets set state='matched',pair_id=v_pair.id,room_id=v_room.id,matched_at=now(),updated_at=now(),version=version+1 where id in(v_a.id,v_b.id);
  perform public.matchmaking_log_transition(v_a.id,v_pair.id,null,'searching','matched','room_first_pair_reserved');
  perform public.matchmaking_log_transition(v_b.id,v_pair.id,null,'searching','matched','room_first_pair_reserved');
  return to_jsonb(v_pair) || jsonb_build_object('classification','MATCHING_SUCCESS','roomCode',v_room.code);
end;
$$;

create or replace function public.matchmaking_cancel_ticket(
  p_user_id uuid,p_reason text default 'user_cancelled',p_request_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.matchmaking_tickets%rowtype; v_pair public.matchmaking_pairs%rowtype; v_partner uuid; v_from text;
begin
  select * into v_ticket from public.matchmaking_tickets where user_id=p_user_id
    and state in ('searching','candidate_found','waiting_confirmation','matched','playing') order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('state','idle','reused',true); end if;
  if v_ticket.state in ('matched','playing') then raise exception using errcode='P0001',message='MATCH_ALREADY_CONNECTED'; end if;
  v_from:=v_ticket.state;
  if v_ticket.pair_id is not null then
    select * into v_pair from public.matchmaking_pairs where id=v_ticket.pair_id for update;
    if v_pair.state in ('candidate_found','waiting_confirmation') then
      update public.matchmaking_pairs set state='cancelled',cancel_reason=p_reason,updated_at=now(),version=version+1 where id=v_pair.id;
      v_partner := case when v_pair.user_a_id=p_user_id then v_pair.user_b_id else v_pair.user_a_id end;
      update public.matchmaking_tickets set state='searching',pair_id=null,confirmation_deadline=null,updated_at=now(),version=version+1 where user_id=v_partner and pair_id=v_pair.id and expires_at>now();
    end if;
  end if;
  if v_ticket.room_id is not null then
    update public.room_members set status='exited',exited_at=coalesce(exited_at,now()) where room_id=v_ticket.room_id and user_id=p_user_id and status='active';
    update public.rooms set status='closed',formation_state=null,completed_at=coalesce(completed_at,now()) where id=v_ticket.room_id and status in ('connecting','ready');
  end if;
  update public.matchmaking_tickets set state='cancelled',cancel_reason=p_reason,closed_at=now(),updated_at=now(),version=version+1 where id=v_ticket.id returning * into v_ticket;
  perform public.matchmaking_log_transition(v_ticket.id,v_ticket.pair_id,p_user_id,v_from,'cancelled',p_reason,p_request_id);
  return to_jsonb(v_ticket);
end;
$$;

revoke all on function public.matchmaking_create_waiting_room(uuid) from public, anon, authenticated;
revoke all on function public.matchmaking_start_ticket(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.matchmaking_ensure_group(uuid) from public, anon, authenticated;
revoke all on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.matchmaking_cancel_ticket(uuid,text,text) from public, anon, authenticated;
grant execute on function public.matchmaking_create_waiting_room(uuid) to service_role;
grant execute on function public.matchmaking_start_ticket(uuid,jsonb,text) to service_role;
grant execute on function public.matchmaking_ensure_group(uuid) to service_role;
grant execute on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.matchmaking_cancel_ticket(uuid,text,text) to service_role;

commit;
