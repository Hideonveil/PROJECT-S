with eligible_profiles as (
  select p.id, p.created_at
  from analytics.user_facts p
  where not p.is_synthetic
),
activity_days as (
  select distinct pe.user_id, pe.occurred_at::date as activity_day
  from public.product_events pe
  join eligible_profiles p on p.id = pe.user_id
  where pe.user_id is not null
),
waits as (
  select extract(epoch from (t.matched_at - t.search_started_at)) as wait_seconds
  from public.matchmaking_tickets t
  join eligible_profiles p on p.id = t.user_id
  where t.matched_at is not null
    and t.search_started_at is not null
),
metric_rows as (
  select 'total_users'::text as metric, count(*)::numeric as value from eligible_profiles
  union all
  select 'new_today', count(*)::numeric from eligible_profiles where created_at::date = current_date
  union all
  select 'dau', count(distinct user_id)::numeric from activity_days where activity_day = current_date
  union all
  select 'returning_today', count(distinct a.user_id)::numeric
  from activity_days a
  where a.activity_day = current_date
    and exists (
      select 1 from activity_days prior
      where prior.user_id = a.user_id and prior.activity_day < current_date
    )
  union all
  select 'd1_return', count(distinct a.user_id)::numeric
  from activity_days a
  join eligible_profiles p on p.id = a.user_id
  where a.activity_day = (p.created_at::date + 1)
  union all
  select 'd3_return', count(distinct a.user_id)::numeric
  from activity_days a
  join eligible_profiles p on p.id = a.user_id
  where a.activity_day = (p.created_at::date + 3)
  union all
  select 'd7_return', count(distinct a.user_id)::numeric
  from activity_days a
  join eligible_profiles p on p.id = a.user_id
  where a.activity_day = (p.created_at::date + 7)
  union all
  select 'ranked_ticket_users', count(distinct t.user_id)::numeric
  from public.matchmaking_tickets t join eligible_profiles p on p.id = t.user_id
  where t.mode = 'ranked'
  union all
  select 'casual_ticket_users', count(distinct t.user_id)::numeric
  from public.matchmaking_tickets t join eligible_profiles p on p.id = t.user_id
  where t.mode = 'casual'
  union all
  select 'rooms_created', count(*)::numeric from public.rooms r
  where exists (
    select 1 from public.room_members rm
    join eligible_profiles p on p.id = rm.user_id
    where rm.room_id = r.id
  )
  union all
  select 'sessions_created', count(*)::numeric from public.sessions s
  where exists (
    select 1 from public.room_members rm
    join eligible_profiles p on p.id = rm.user_id
    where rm.room_id = s.room_id
  )
  union all
  select 'median_wait_seconds', coalesce(percentile_cont(0.5) within group (order by wait_seconds), 0)::numeric from waits
  union all
  select 'p95_wait_seconds', coalesce(percentile_cont(0.95) within group (order by wait_seconds), 0)::numeric from waits
)
select metric, value from metric_rows order by metric;
