begin;

-- A cancellation may race a match commit or encounter an older ticket whose
-- room_id was never synchronized. Reconcile only pre-session memberships that
-- have no live Ticket, Group or Session backing; never touch a live match.
create or replace function public.reconcile_orphan_waiting_rooms(
  p_user_id uuid,
  p_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_reconciled integer := 0;
begin
  for v_room in
    select r.id
      from public.room_members rm
      join public.rooms r on r.id = rm.room_id
     where rm.user_id = p_user_id
       and rm.status = 'active'
       and r.status in ('connecting','ready')
       and coalesce(r.formation_state,'') not in ('formal')
       and not exists (
         select 1
           from public.sessions s
          where s.room_id = r.id
            and s.status in ('ready','playing')
            and s.players ? p_user_id::text
       )
       and not exists (
         select 1
           from public.matchmaking_tickets t
          where t.user_id = p_user_id
            and t.state in ('searching','candidate_found','waiting_confirmation','matched','playing')
            and (
              t.room_id = r.id
              or exists (
                select 1 from public.matchmaking_groups g
                 where g.id = t.group_id and g.room_id = r.id
                   and g.state in ('searching','forming','backfilling','partial_ready','locked','matched','playing')
              )
            )
       )
       and not exists (
         select 1
           from public.matchmaking_groups g
           join public.matchmaking_group_members gm on gm.group_id = g.id
          where g.room_id = r.id
            and gm.user_id = p_user_id
            and coalesce(gm.decision,'pending') <> 'rejected'
            and g.state in ('searching','forming','backfilling','partial_ready','locked','matched','playing')
       )
     for update of rm, r
  loop
    update public.room_members
       set status = 'exited', exited_at = coalesce(exited_at, now())
     where room_id = v_room.id and user_id = p_user_id and status = 'active';

    if not exists (select 1 from public.room_members where room_id = v_room.id and status = 'active') then
      update public.rooms
         set status = 'closed', formation_state = null, completed_at = coalesce(completed_at, now())
       where id = v_room.id and status in ('connecting','ready');
    end if;

    perform public.append_room_state_event(
      v_room.id,
      'orphan_membership_reconciled',
      p_user_id,
      p_request_id,
      '{}'::jsonb
    );
    v_reconciled := v_reconciled + 1;
  end loop;

  return jsonb_build_object('reconciled', v_reconciled);
end;
$$;

revoke all on function public.reconcile_orphan_waiting_rooms(uuid,text) from public, anon, authenticated;
grant execute on function public.reconcile_orphan_waiting_rooms(uuid,text) to service_role;

commit;
