-- P1 operations: return raw MVP funnel counts without freezing product formulas.
-- The function is service-role only; product rules and weighting remain separate.

create or replace function public.ops_mvp_snapshot(
  p_since timestamptz default (now() - interval '14 days')
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'since', p_since,
    'generatedAt', now(),
    'accountsCreated', (
      select count(*) from public.product_events
      where event_name = 'account_registered' and occurred_at >= p_since
    ),
    'profilesCreated', (
      select count(*) from public.profiles where created_at >= p_since
    ),
    'searchesStarted', (
      select count(*) from public.matchmaking_state_events
      where to_state = 'searching' and reason = 'start' and occurred_at >= p_since
    ),
    'candidatesPresented', (
      select count(distinct pair_id) from public.matchmaking_state_events
      where to_state = 'waiting_confirmation' and occurred_at >= p_since
    ),
    'matchesConfirmed', (
      select count(distinct pair_id) from public.matchmaking_state_events
      where to_state = 'matched' and occurred_at >= p_since
    ),
    'sessionsCompleted', (
      select count(*) from public.sessions
      where status = 'completed' and ended_at >= p_since
    ),
    'ratingsSubmitted', (
      select count(*) from public.session_responses
      where rating is not null and updated_at >= p_since
    ),
    'friendshipsAccepted', (
      select count(*) from public.friendships
      where status = 'accepted' and created_at >= p_since
    ),
    'feedbackSubmitted', (
      select count(*) from public.feedback where created_at >= p_since
    ),
    'feedbackEmailFailed', (
      select count(*) from public.feedback
      where email_status = 'failed' and created_at >= p_since
    ),
    'clientErrors', (
      select count(*) from public.product_events
      where event_name = 'client_error' and occurred_at >= p_since
    ),
    'serverErrors', (
      select count(*) from public.product_events
      where event_name = 'server_error' and occurred_at >= p_since
    )
  );
$$;

revoke all on function public.ops_mvp_snapshot(timestamptz) from public, anon, authenticated;
grant execute on function public.ops_mvp_snapshot(timestamptz) to service_role;

