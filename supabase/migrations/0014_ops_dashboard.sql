-- Daily raw counts for the private operations dashboard.
-- Presentation ratios are calculated by the dashboard, not frozen into product rules.

create or replace function public.ops_mvp_daily_series(
  p_since timestamptz default (now() - interval '14 days')
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with day_range as (
    select generate_series(
      (p_since at time zone 'Asia/Shanghai')::date,
      (now() at time zone 'Asia/Shanghai')::date,
      interval '1 day'
    )::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day,
    'profilesCreated', (
      select count(*) from public.profiles p
      where p.created_at >= (day::timestamp at time zone 'Asia/Shanghai')
        and p.created_at < ((day + 1)::timestamp at time zone 'Asia/Shanghai')
    ),
    'searchesStarted', (
      select count(*) from public.matchmaking_state_events e
      where e.to_state = 'searching' and e.reason = 'start'
        and e.occurred_at >= (day::timestamp at time zone 'Asia/Shanghai')
        and e.occurred_at < ((day + 1)::timestamp at time zone 'Asia/Shanghai')
    ),
    'matchesConfirmed', (
      select count(distinct e.pair_id) from public.matchmaking_state_events e
      where e.to_state = 'matched'
        and e.occurred_at >= (day::timestamp at time zone 'Asia/Shanghai')
        and e.occurred_at < ((day + 1)::timestamp at time zone 'Asia/Shanghai')
    ),
    'sessionsCompleted', (
      select count(*) from public.sessions s
      where s.status = 'completed'
        and s.ended_at >= (day::timestamp at time zone 'Asia/Shanghai')
        and s.ended_at < ((day + 1)::timestamp at time zone 'Asia/Shanghai')
    ),
    'errors', (
      select count(*) from public.product_events pe
      where pe.event_name in ('client_error', 'server_error')
        and pe.occurred_at >= (day::timestamp at time zone 'Asia/Shanghai')
        and pe.occurred_at < ((day + 1)::timestamp at time zone 'Asia/Shanghai')
    )
  ) order by day), '[]'::jsonb)
  from day_range;
$$;

revoke all on function public.ops_mvp_daily_series(timestamptz) from public, anon, authenticated;
grant execute on function public.ops_mvp_daily_series(timestamptz) to service_role;
