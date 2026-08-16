-- Read-only pre-cleanup inventory for PROJECT-S.
-- Run this first in the Supabase SQL editor and review every count.
select 'match_requests' as table_name, count(*) as row_count from public.match_requests
union all select 'matches', count(*) from public.matches
union all select 'applications', count(*) from public.applications
union all select 'rooms', count(*) from public.rooms
union all select 'room_members', count(*) from public.room_members
union all select 'messages', count(*) from public.messages
union all select 'sessions', count(*) from public.sessions
union all select 'session_responses', count(*) from public.session_responses
union all select 'recent_connections', count(*) from public.recent_connections
union all select 'product_events', count(*) from public.product_events
union all select 'profiles', count(*) from public.profiles
union all select 'friendships', count(*) from public.friendships
union all select 'feedback', count(*) from public.feedback
order by table_name;
