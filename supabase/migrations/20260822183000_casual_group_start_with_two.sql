-- Casual groups can be opened once the room has two total players.
-- desired_teammates and the range intersection still control which players
-- may join and the maximum size, but they must not block a two-player start.

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
  if not found or v_group.owner_user_id<>p_user_id then
    raise exception using errcode='42501',message='GROUP_FORBIDDEN';
  end if;
  if v_group.state='waiting_confirmation' then return to_jsonb(v_group); end if;
  if v_group.state not in ('searching','partial_ready') then
    raise exception using errcode='P0001',message='GROUP_STATE_CONFLICT';
  end if;

  select count(*) into v_count
    from public.matchmaking_group_members
   where group_id=v_group.id and not is_owner and decision<>'rejected';
  select greatest(coalesce(max(t.min_teammates),1)), least(coalesce(min(t.desired_teammates),5))
    into v_group_min, v_group_max
    from public.matchmaking_group_members gm
    join public.matchmaking_tickets t on t.id=gm.ticket_id
   where gm.group_id=v_group.id and gm.decision<>'rejected';

  -- One teammate means two total players (owner + teammate). A group can be
  -- opened at that point even when its original desired teammate count was
  -- higher. Keep the intersection's upper bound to prevent overfilling.
  if v_group_min > v_group_max or v_count < 1 or v_count > v_group_max then
    raise exception using errcode='P0001',message='GROUP_SIZE_CONFLICT';
  end if;

  select coalesce((wait_strategy->>'confirmationTtlSeconds')::integer,45)
    into v_ttl
    from public.matchmaking_rule_sets where id=v_group.rule_set_id;
  update public.matchmaking_groups
     set min_teammates=v_group_min,
         desired_teammates=v_group_max,
         state='waiting_confirmation',
         confirmation_deadline=now()+make_interval(secs=>v_ttl),
         updated_at=now(),
         version=version+1
   where id=v_group.id
   returning * into v_group;
  update public.matchmaking_group_members
     set decision=case when is_owner then 'accepted' else 'pending' end,
         responded_at=case when is_owner then now() else null end,
         updated_at=now()
   where group_id=v_group.id;
  update public.matchmaking_tickets
     set state='waiting_confirmation',
         confirmation_deadline=v_group.confirmation_deadline,
         updated_at=now(),
         version=version+1
   where group_id=v_group.id and state in ('searching','candidate_found');
  perform public.matchmaking_log_transition(
    null,null,p_user_id,'partial_ready','waiting_confirmation','owner_started',p_request_id,
    jsonb_build_object('groupId',v_group.id,'teamRange',jsonb_build_object('min',v_group_min,'max',v_group_max))
  );
  return to_jsonb(v_group);
end;
$$;

revoke all on function public.matchmaking_start_group(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.matchmaking_start_group(uuid,uuid,text) to service_role;
