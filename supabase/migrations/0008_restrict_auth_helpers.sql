-- These helpers are used by authenticated RLS policies only.
-- Remove PostgreSQL's default PUBLIC execute grant so they cannot be called
-- through the Data API by unauthenticated clients.

revoke execute on function public.current_profile_id() from public, anon;
revoke execute on function public.is_room_member(uuid) from public, anon;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
