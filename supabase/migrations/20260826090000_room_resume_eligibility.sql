-- Room-first recovery contract.
-- A live ticket is not sufficient evidence that a player can resume a Room.
-- Reuse only a ticket with a current Room/Group/Session backing; otherwise
-- close the orphan through the normal ticket lifecycle before creating a new
-- ticket. This keeps the active-ticket uniqueness guard intact.

begin;

create or replace function public.matchmaking_start_ticket(
  p_user_id uuid,
  p_input jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.matchmaking_tickets%rowtype;
  v_ticket public.matchmaking_tickets%rowtype;
  v_rules public.matchmaking_rule_sets%rowtype;
  v_room public.rooms%rowtype;
  v_group public.matchmaking_groups%rowtype;
  v_session public.sessions%rowtype;
  v_ttl integer;
  v_target smallint;
  v_min smallint;
  v_effective_room_id uuid;
  v_has_valid_backing boolean := false;
  v_group_member_exists boolean := false;
  v_remaining integer := 0;
begin
  perform 1 from public.profiles where id = p_user_id for update;

  select * into v_existing
    from public.matchmaking_tickets
   where user_id = p_user_id
     and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
   order by created_at desc
   limit 1
   for update;

  if found then
    v_effective_room_id := v_existing.room_id;

    if v_existing.group_id is not null then
      select * into v_group
        from public.matchmaking_groups
       where id = v_existing.group_id;
      v_effective_room_id := coalesce(v_group.room_id, v_effective_room_id);
      select exists(
        select 1
          from public.matchmaking_group_members gm
         where gm.group_id = v_existing.group_id
           and gm.ticket_id = v_existing.id
           and gm.user_id = p_user_id
           and gm.decision = 'accepted'
      ) into v_group_member_exists;
    end if;

    if v_effective_room_id is not null then
      select * into v_room
        from public.rooms
       where id = v_effective_room_id;

      if found
         and v_room.status in ('connecting','ready','playing')
         and exists(
           select 1 from public.room_members rm
            where rm.room_id = v_effective_room_id
              and rm.user_id = p_user_id
              and rm.status = 'active'
         ) then
        v_session := null;
        select * into v_session
          from public.sessions
         where room_id = v_effective_room_id
         order by created_at desc
         limit 1;

        if found
           and v_session.status in ('ready','playing')
           and coalesce(v_session.players, '[]'::jsonb) ? p_user_id::text then
          v_has_valid_backing := true;
        elsif not found
          and v_existing.state in ('searching','candidate_found','waiting_confirmation')
          and (
            v_existing.room_id = v_effective_room_id
            or (v_existing.group_id is not null and v_group_member_exists
                and v_group.state in ('searching','partial_ready','forming','backfilling','locked')
                and v_group.room_id = v_effective_room_id)
          ) then
          v_has_valid_backing := true;
        end if;
      end if;
    end if;

    if v_has_valid_backing then
      return to_jsonb(v_existing) || jsonb_build_object('reused', true);
    end if;

    -- This is an orphaned live ticket, not an active player. Keep the audit
    -- row and release the active-ticket uniqueness guard through lifecycle.
    if v_existing.room_id is not null then
      update public.room_members
         set status = 'exited', exited_at = coalesce(exited_at, now())
       where room_id = v_existing.room_id
         and user_id = p_user_id
         and status = 'active';
    end if;
    if v_effective_room_id is not null and v_effective_room_id <> v_existing.room_id then
      update public.room_members
         set status = 'exited', exited_at = coalesce(exited_at, now())
       where room_id = v_effective_room_id
         and user_id = p_user_id
         and status = 'active';
    end if;

    if v_existing.group_id is not null then
      update public.matchmaking_group_members
         set decision = 'rejected', responded_at = coalesce(responded_at, now()), updated_at = now()
       where ticket_id = v_existing.id
         and user_id = p_user_id
         and decision <> 'rejected';
      select count(*) into v_remaining
        from public.matchmaking_group_members
       where group_id = v_existing.group_id
         and decision <> 'rejected';
      if v_remaining = 0 then
        update public.matchmaking_groups
           set state = 'cancelled', closed_at = coalesce(closed_at, now()),
               cancel_reason = 'orphaned_room', updated_at = now(), version = version + 1
         where id = v_existing.group_id
           and state not in ('completed','cancelled');
      end if;
    end if;

    if v_existing.room_id is not null then
      update public.rooms r
         set status = 'closed', formation_state = null, completed_at = coalesce(completed_at, now())
       where r.id = v_existing.room_id
         and r.status in ('connecting','ready','playing')
         and not exists (select 1 from public.room_members rm where rm.room_id = r.id and rm.status = 'active');
    end if;
    if v_effective_room_id is not null and v_effective_room_id <> v_existing.room_id then
      update public.rooms r
         set status = 'closed', formation_state = null, completed_at = coalesce(completed_at, now())
       where r.id = v_effective_room_id
         and r.status in ('connecting','ready','playing')
         and not exists (select 1 from public.room_members rm where rm.room_id = r.id and rm.status = 'active');
    end if;

    update public.matchmaking_tickets
       set state = 'cancelled', cancel_reason = 'orphaned_room', closed_at = coalesce(closed_at, now()),
           updated_at = now(), version = version + 1
     where id = v_existing.id;
    perform public.matchmaking_log_transition(
      v_existing.id, v_existing.pair_id, p_user_id, v_existing.state, 'cancelled',
      'orphaned_room', p_request_id
    );
  end if;

  select * into v_rules
    from public.matchmaking_rule_sets
   where game_id = coalesce(nullif(p_input->>'gameId',''),'deadlock')
     and active
   limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'MATCH_RULE_SET_MISSING';
  end if;

  v_ttl := coalesce((v_rules.wait_strategy->>'ticketTtlSeconds')::integer, 1800);
  v_target := case when p_input->>'mode' = 'casual'
    then least(5, greatest(1, coalesce((p_input->>'desiredTeammates')::integer, 1)))
    else 1 end;
  v_min := case when p_input->>'mode' = 'casual'
    then least(v_target, greatest(1, coalesce((p_input->>'minTeammates')::integer, v_target)))
    else 1 end;

  insert into public.matchmaking_tickets(
    user_id, game_id, mode, rank_code, desired_roles, microphone_preference,
    desired_teammates, min_teammates, state, rule_set_id, request_id, metadata, expires_at
  ) values (
    p_user_id, v_rules.game_id, p_input->>'mode', nullif(p_input->>'rankCode',''),
    array(select jsonb_array_elements_text(coalesce(p_input->'desiredRoles','[]'::jsonb))::smallint),
    coalesce(nullif(p_input->>'microphonePreference',''),'any'),
    v_target, v_min, 'searching', v_rules.id, nullif(p_request_id,''), coalesce(p_input,'{}'::jsonb),
    now() + make_interval(secs => v_ttl)
  ) returning * into v_ticket;

  v_room := public.matchmaking_create_waiting_room(v_ticket.id);
  select * into v_ticket from public.matchmaking_tickets where id = v_ticket.id;
  perform public.matchmaking_log_transition(
    v_ticket.id, null, p_user_id, 'idle', 'searching', 'room_first_start', p_request_id,
    jsonb_build_object('roomId', v_ticket.room_id)
  );
  return to_jsonb(v_ticket) || jsonb_build_object('reused', false, 'roomCode', v_room->>'code');
end;
$$;

-- Keep the ticket pointer aligned even when a ticket joins an already-forming
-- group whose Room was created before the ticket was reserved.
create or replace function public.matchmaking_sync_ticket_room_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  if new.group_id is null then return new; end if;
  select room_id into v_room_id from public.matchmaking_groups where id = new.group_id;
  if v_room_id is not null then new.room_id := v_room_id; end if;
  return new;
end;
$$;

create or replace function public.matchmaking_sync_group_ticket_room_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.room_id is not null then
    update public.matchmaking_tickets
       set room_id = new.room_id, updated_at = now(), version = version + 1
     where group_id = new.id
       and room_id is distinct from new.room_id;
  end if;
  return new;
end;
$$;

drop trigger if exists matchmaking_ticket_room_sync on public.matchmaking_tickets;
create trigger matchmaking_ticket_room_sync
before insert or update of group_id on public.matchmaking_tickets
for each row execute function public.matchmaking_sync_ticket_room_id();

drop trigger if exists matchmaking_group_room_sync on public.matchmaking_groups;
create trigger matchmaking_group_room_sync
after update of room_id on public.matchmaking_groups
for each row when (new.room_id is distinct from old.room_id)
execute function public.matchmaking_sync_group_ticket_room_ids();

revoke all on function public.matchmaking_start_ticket(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.matchmaking_start_ticket(uuid,jsonb,text) to service_role;

commit;
