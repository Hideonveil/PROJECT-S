-- A Room snapshot is the client reconciliation authority.  Give it a
-- monotonic server-issued version so a delayed read can never overwrite a
-- newer roster/lifecycle update on another client.

begin;

alter table public.rooms
  add column if not exists realtime_version bigint not null default 0;

create or replace function public.bump_room_realtime_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'rooms' then
    -- A direct Room mutation receives the next version.  The member trigger
    -- sets the version itself, so do not increment it twice in that path.
    if new.realtime_version is not distinct from old.realtime_version then
      new.realtime_version := old.realtime_version + 1;
    end if;
    return new;
  end if;

  update public.rooms
     set realtime_version = realtime_version + 1
   where id = coalesce(new.room_id, old.room_id);
  return coalesce(new, old);
end;
$$;

revoke all on function public.bump_room_realtime_version() from public, anon, authenticated;

drop trigger if exists rooms_bump_realtime_version on public.rooms;
create trigger rooms_bump_realtime_version
before update on public.rooms
for each row execute function public.bump_room_realtime_version();

drop trigger if exists room_members_bump_realtime_version on public.room_members;
create trigger room_members_bump_realtime_version
after insert or update or delete on public.room_members
for each row execute function public.bump_room_realtime_version();

commit;
