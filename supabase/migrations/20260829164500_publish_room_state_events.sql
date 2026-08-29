-- Room Realtime carries a small versioned invalidation event. The browser
-- always reloads the authoritative RoomProjection after receiving it.

begin;

do $$
begin
  alter publication supabase_realtime add table public.room_state_events;
exception
  when duplicate_object then null;
end;
$$;

commit;
