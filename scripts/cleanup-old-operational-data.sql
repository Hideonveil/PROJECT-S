-- PROJECT-S operational-data cleanup.
-- This intentionally KEEPS auth users, profiles, user_games, friendships,
-- feedback, and the games catalog.
-- Do not run until audit-old-data.sql has been reviewed and an external
-- database backup has been created from the Supabase dashboard.

begin;

-- Remove dependent/ledger rows first, then their parent workflow rows.
delete from public.product_events;
delete from public.session_responses;
delete from public.recent_connections;
delete from public.messages;
delete from public.room_members;
delete from public.sessions;
delete from public.rooms;
delete from public.applications;
delete from public.matches;
delete from public.match_requests;

-- Safety check: these retained tables must still exist and remain untouched.
do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.friendships') is null
    or to_regclass('public.feedback') is null then
    raise exception 'Retained PROJECT-S tables are missing; rolling back cleanup';
  end if;
end $$;

commit;
