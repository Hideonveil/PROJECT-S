-- OPS V2 analytics boundary.
--
-- Metabase receives a dedicated read-only database role later. It must never
-- be granted direct access to auth.users merely to exclude synthetic accounts.
-- This narrow view exposes only the profile facts required by LIVE/GROWTH
-- reporting and keeps the synthetic marker out of every report query.

create schema if not exists analytics;
revoke all on schema analytics from public;

create or replace view analytics.user_facts
with (security_barrier = true) as
select
  p.id,
  p.created_at,
  p.online,
  p.voice,
  p.last_seen,
  coalesce(au.raw_user_meta_data ->> 'account_type', '') = 'synthetic_test' as is_synthetic
from public.profiles p
left join auth.users au on au.id = p.auth_user_id;

revoke all on analytics.user_facts from public, anon, authenticated;
comment on view analytics.user_facts is
  'Safe OPS V2 analytics facts. Grant SELECT only to the dedicated analytics_readonly role.';
