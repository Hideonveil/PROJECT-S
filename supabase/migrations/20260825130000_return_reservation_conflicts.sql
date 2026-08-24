-- Expected matchmaking contention is a normal candidate miss, not a database
-- exception. Returning a committed JSON result avoids ERROR logging and
-- transaction rollback amplification. Genuine database serialization failures
-- are not caught here and continue to propagate as SQLSTATE 40001.

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
  if v_a.id is null or v_b.id is null
     or v_a.state<>'searching' or v_b.state<>'searching' or v_a.user_id=v_b.user_id
     or v_a.expires_at<=now() or v_b.expires_at<=now() then
    return jsonb_build_object('ok', false, 'reason', 'MATCH_RESERVATION_CONFLICT', 'retryable', true);
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
    return jsonb_build_object('ok', false, 'reason', 'GROUP_RESERVATION_CONFLICT', 'retryable', true);
  end if;

  select count(*) into v_member_count from public.matchmaking_group_members
    where group_id=v_group.id and decision<>'rejected';

  select greatest(coalesce(max(t.min_teammates),1), v_ticket.min_teammates),
         least(coalesce(min(t.desired_teammates),5), v_ticket.desired_teammates)
    into v_group_min, v_group_max
    from public.matchmaking_group_members gm
    join public.matchmaking_tickets t on t.id=gm.ticket_id
   where gm.group_id=v_group.id and gm.decision<>'rejected';
  if v_group_min > v_group_max then
    return jsonb_build_object('ok', false, 'reason', 'GROUP_SIZE_CONFLICT', 'retryable', true);
  end if;
  if v_member_count > v_group_max then
    return jsonb_build_object('ok', false, 'reason', 'GROUP_SIZE_CONFLICT', 'retryable', true);
  end if;

  if v_ticket.group_id is not null and v_ticket.group_id <> v_group.id then
    select * into v_own_group from public.matchmaking_groups where id=v_ticket.group_id for update;
    if v_own_group.owner_user_id<>v_ticket.user_id or v_own_group.state not in ('searching','partial_ready')
       or (select count(*) from public.matchmaking_group_members where group_id=v_own_group.id and decision<>'rejected') <> 1 then
      return jsonb_build_object('ok', false, 'reason', 'GROUP_RESERVATION_CONFLICT', 'retryable', true);
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

revoke all on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.matchmaking_reserve_pair(uuid,uuid,jsonb,jsonb) to service_role;
revoke all on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.matchmaking_reserve_group_member(uuid,uuid,jsonb,jsonb) to service_role;
