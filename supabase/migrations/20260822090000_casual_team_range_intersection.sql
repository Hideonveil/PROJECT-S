-- Casual team-size ranges are an intersection, not an owner-only capacity.
-- A group may accept a new member only when every member can still agree on
-- at least one final teammate count.

do $$
declare
  v_group record;
  v_min smallint;
  v_max smallint;
begin
  -- Normalize groups created by the old owner-only rule before new joins use
  -- the effective intersection. Invalid legacy groups are returned to search.
  for v_group in
    select id from public.matchmaking_groups
    where state in ('searching','partial_ready','waiting_confirmation')
  loop
    select greatest(coalesce(max(t.min_teammates),1)::smallint),
           least(coalesce(min(t.desired_teammates),5)::smallint)
      into v_min, v_max
      from public.matchmaking_group_members gm
      join public.matchmaking_tickets t on t.id=gm.ticket_id
     where gm.group_id=v_group.id and gm.decision<>'rejected';
    if v_min > v_max then
      update public.matchmaking_tickets
         set group_id=null, state='searching', confirmation_deadline=null, updated_at=now(), version=version+1
       where group_id=v_group.id and state in ('searching','candidate_found','waiting_confirmation');
      delete from public.matchmaking_group_members where group_id=v_group.id;
      update public.matchmaking_groups
         set state='cancelled', closed_at=now(), cancel_reason='team_range_conflict', updated_at=now(), version=version+1
       where id=v_group.id;
    else
      update public.matchmaking_groups
         set min_teammates=v_min, desired_teammates=v_max, updated_at=now(), version=version+1
       where id=v_group.id;
    end if;
  end loop;
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
  -- Missing minTeammates means strict matching. Flexibility must be explicit.
  v_min := case when p_input->>'mode' = 'casual'
    then least(v_target, greatest(1, coalesce((p_input->>'minTeammates')::integer, v_target))) else 1 end;

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
  v_group_min smallint;
  v_group_max smallint;
begin
  select * into v_group from public.matchmaking_groups where id=p_group_id for update;
  select * into v_ticket from public.matchmaking_tickets where id=p_ticket_id for update;
  if not found or v_group.id is null or v_group.owner_user_id=v_ticket.user_id
     or v_group.state not in ('searching','partial_ready')
     or v_ticket.mode <> 'casual' or v_ticket.state <> 'searching' or v_ticket.expires_at<=now() then
    raise exception using errcode='40001', message='GROUP_RESERVATION_CONFLICT';
  end if;

  select count(*) into v_member_count from public.matchmaking_group_members
    where group_id=v_group.id and decision<>'rejected';

  -- Calculate the intersection from every existing member, then include the
  -- candidate. desired_teammates excludes the owner.
  select greatest(coalesce(max(t.min_teammates),1), v_ticket.min_teammates),
         least(coalesce(min(t.desired_teammates),5), v_ticket.desired_teammates)
    into v_group_min, v_group_max
    from public.matchmaking_group_members gm
    join public.matchmaking_tickets t on t.id=gm.ticket_id
   where gm.group_id=v_group.id and gm.decision<>'rejected';
  if v_group_min > v_group_max then
    raise exception using errcode='40001', message='GROUP_SIZE_CONFLICT';
  end if;
  -- v_member_count is the current total including the owner. The new member
  -- would make it v_member_count teammates, so never exceed the intersection.
  if v_member_count > v_group_max then
    raise exception using errcode='40001', message='GROUP_SIZE_CONFLICT';
  end if;

  -- A simultaneous starter may have a one-person placeholder group. It is
  -- safe to absorb that placeholder only after the range intersection passes.
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
  update public.matchmaking_groups set
    min_teammates=v_group_min, desired_teammates=v_group_max,
    state='partial_ready',updated_at=now(),version=version+1 where id=v_group.id;
  perform public.matchmaking_log_transition(v_ticket.id,null,null,'searching','candidate_found','group_reserved',null,jsonb_build_object('groupId',v_group.id,'hard',coalesce(p_hard_snapshot,'{}'::jsonb),'soft',coalesce(p_soft_snapshot,'{}'::jsonb),'teamRange',jsonb_build_object('min',v_group_min,'max',v_group_max)));
  return to_jsonb(v_group) || jsonb_build_object('min_teammates',v_group_min,'desired_teammates',v_group_max);
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
  v_group_min smallint;
  v_group_max smallint;
begin
  select * into v_group from public.matchmaking_groups where id=p_group_id for update;
  if not found or v_group.owner_user_id<>p_user_id then raise exception using errcode='42501',message='GROUP_FORBIDDEN'; end if;
  if v_group.state='waiting_confirmation' then return to_jsonb(v_group); end if;
  if v_group.state not in ('searching','partial_ready') then raise exception using errcode='P0001',message='GROUP_STATE_CONFLICT'; end if;
  select count(*) into v_count from public.matchmaking_group_members where group_id=v_group.id and not is_owner and decision<>'rejected';
  select greatest(coalesce(max(t.min_teammates),1)), least(coalesce(min(t.desired_teammates),5))
    into v_group_min, v_group_max
    from public.matchmaking_group_members gm
    join public.matchmaking_tickets t on t.id=gm.ticket_id
   where gm.group_id=v_group.id and gm.decision<>'rejected';
  if v_group_min > v_group_max or v_count < v_group_min or v_count > v_group_max then
    raise exception using errcode='P0001',message='GROUP_SIZE_CONFLICT';
  end if;
  select coalesce((wait_strategy->>'confirmationTtlSeconds')::integer,45) into v_ttl from public.matchmaking_rule_sets where id=v_group.rule_set_id;
  update public.matchmaking_groups set min_teammates=v_group_min,desired_teammates=v_group_max,state='waiting_confirmation',confirmation_deadline=now()+make_interval(secs=>v_ttl),updated_at=now(),version=version+1 where id=v_group.id returning * into v_group;
  update public.matchmaking_group_members set decision=case when is_owner then 'accepted' else 'pending' end,responded_at=case when is_owner then now() else null end,updated_at=now() where group_id=v_group.id;
  update public.matchmaking_tickets set state='waiting_confirmation',confirmation_deadline=v_group.confirmation_deadline,updated_at=now(),version=version+1 where group_id=v_group.id and state in ('searching','candidate_found');
  perform public.matchmaking_log_transition(null,null,p_user_id,'partial_ready','waiting_confirmation','owner_started',p_request_id,jsonb_build_object('groupId',v_group.id,'teamRange',jsonb_build_object('min',v_group_min,'max',v_group_max)));
  return to_jsonb(v_group);
end;
$$;

revoke all on function public.matchmaking_start_ticket(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.matchmaking_start_group(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.matchmaking_start_ticket(uuid,jsonb,text) to service_role;
grant execute on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.matchmaking_start_group(uuid,uuid,text) to service_role;
