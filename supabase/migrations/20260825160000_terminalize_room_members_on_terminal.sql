-- Terminal Room/Session invariant: no active room member may survive a
-- terminal Room or Session transition.
--
-- This is forward-only. It fixes future terminal transitions and deliberately
-- does not backfill or mutate historical residue rows.

begin;

create or replace function public.phase1_terminalize_room_members(
  p_room_id uuid,
  p_terminal_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.room_members
     set status = 'exited',
         exited_at = coalesce(exited_at, p_terminal_at, now()),
         disconnected_at = null
   where room_id = p_room_id
     and status = 'active';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.phase1_terminalize_room_members(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.phase1_terminalize_room_members(uuid, timestamptz)
  to service_role;

create or replace function public.phase1_terminalize_members_after_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('completed', 'cancelled')
     and new.room_id is not null then
    perform public.phase1_terminalize_room_members(
      new.room_id,
      coalesce(new.ended_at, now())
    );
  end if;

  return new;
end;
$$;

revoke all on function public.phase1_terminalize_members_after_session()
  from public, anon, authenticated;
grant execute on function public.phase1_terminalize_members_after_session()
  to service_role;

drop trigger if exists phase1_terminalize_members_after_session on public.sessions;
create trigger phase1_terminalize_members_after_session
after update of status on public.sessions
for each row
execute function public.phase1_terminalize_members_after_session();

create or replace function public.phase1_terminalize_members_after_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('completed', 'cancelled', 'finished', 'closed') then
    perform public.phase1_terminalize_room_members(
      new.id,
      coalesce(new.completed_at, now())
    );
  end if;

  return new;
end;
$$;

revoke all on function public.phase1_terminalize_members_after_room()
  from public, anon, authenticated;
grant execute on function public.phase1_terminalize_members_after_room()
  to service_role;

drop trigger if exists phase1_terminalize_members_after_room on public.rooms;
create trigger phase1_terminalize_members_after_room
after update of status on public.rooms
for each row
execute function public.phase1_terminalize_members_after_room();

commit;
