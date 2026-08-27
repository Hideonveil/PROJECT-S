with eligible_profiles as (
  select p.id, p.online, p.voice, p.last_seen
  from analytics.user_facts p
  where not p.is_synthetic
),
matching_pool as (
  select t.user_id, t.mode, t.microphone_preference, t.rank_code,
         extract(epoch from (now() - t.search_started_at)) as wait_seconds
  from public.matchmaking_tickets t
  join eligible_profiles p on p.id = t.user_id
  where t.state in ('searching', 'candidate_found', 'waiting_confirmation')
),
room_counts as (
  select count(*) filter (where r.status in ('connecting', 'ready')) as waiting_rooms,
         count(*) filter (where r.status = 'playing') as playing_rooms
  from public.rooms r
  where exists (
    select 1 from public.room_members rm
    join eligible_profiles p on p.id = rm.user_id
    where rm.room_id = r.id
  )
),
session_counts as (
  select count(*) filter (where s.status = 'active') as active_sessions
  from public.sessions s
  where exists (
    select 1 from public.room_members rm
    join eligible_profiles p on p.id = rm.user_id
    where rm.room_id = s.room_id
  )
),
activity as (
  select count(*) as events_last_5_minutes
  from public.product_events pe
  left join eligible_profiles p on p.id = pe.user_id
  where pe.occurred_at >= now() - interval '5 minutes'
    and (pe.user_id is null or p.id is not null)
)
select metric,
       value,
       detail
from (
  select 'online'::text as metric, count(*)::numeric as value, null::text as detail
  from eligible_profiles where online
  union all
  select 'matching', count(*)::numeric, 'searching, candidate_found, waiting_confirmation'
  from matching_pool
  union all
  select 'ranked_matching', count(*)::numeric, null
  from matching_pool where mode = 'ranked'
  union all
  select 'casual_matching', count(*)::numeric, null
  from matching_pool where mode = 'casual'
  union all
  select 'mic_on', count(*)::numeric, null
  from matching_pool where microphone_preference = 'on'
  union all
  select 'mic_off', count(*)::numeric, null
  from matching_pool where microphone_preference = 'off'
  union all
  select 'mic_any', count(*)::numeric, null
  from matching_pool where microphone_preference = 'any'
  union all
  select 'rank_present', count(*)::numeric, null
  from matching_pool where rank_code is not null and rank_code <> ''
  union all
  select 'waiting_under_30s', count(*)::numeric, null
  from matching_pool where wait_seconds < 30
  union all
  select 'waiting_30_to_60s', count(*)::numeric, null
  from matching_pool where wait_seconds >= 30 and wait_seconds < 60
  union all
  select 'waiting_60_to_120s', count(*)::numeric, null
  from matching_pool where wait_seconds >= 60 and wait_seconds < 120
  union all
  select 'waiting_over_120s', count(*)::numeric, null
  from matching_pool where wait_seconds >= 120
  union all
  select 'waiting_rooms', waiting_rooms::numeric, null from room_counts
  union all
  select 'playing_rooms', playing_rooms::numeric, null from room_counts
  union all
  select 'active_sessions', active_sessions::numeric, null from session_counts
  union all
  select 'activity_last_5_minutes', events_last_5_minutes::numeric, 'last 5 minutes' from activity
) metrics
order by metric;
