-- Explicit-exit lifecycle
--
-- Matchmaking and presence are no longer leases. A player remains online and
-- remains in the pool until an explicit cancel/leave/logout/pagehide request
-- is received. The maintenance RPCs are kept as no-ops for compatibility with
-- old deployments and cron jobs, but they must not mutate application state.

update public.matchmaking_tickets
set expires_at = 'infinity'::timestamptz,
    confirmation_deadline = case
      when state in ('searching','candidate_found','waiting_confirmation','matched','playing')
        then 'infinity'::timestamptz
      else confirmation_deadline
    end,
    updated_at = now()
where state in ('searching','candidate_found','waiting_confirmation','matched','playing');

update public.matchmaking_pairs
set confirmation_deadline = 'infinity'::timestamptz,
    updated_at = now()
where state in ('candidate_found','waiting_confirmation','matched','playing');

update public.matchmaking_groups
set confirmation_deadline = 'infinity'::timestamptz,
    updated_at = now()
where state in ('searching','partial_ready','waiting_confirmation','matched','playing');

create or replace function public.force_explicit_matchmaking_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state in ('searching','candidate_found','waiting_confirmation','matched','playing') then
    if tg_table_name = 'matchmaking_tickets' then
      new.expires_at := 'infinity'::timestamptz;
      new.confirmation_deadline := 'infinity'::timestamptz;
    elsif tg_table_name in ('matchmaking_pairs', 'matchmaking_groups') then
      new.confirmation_deadline := 'infinity'::timestamptz;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists force_explicit_ticket_lifecycle on public.matchmaking_tickets;
create trigger force_explicit_ticket_lifecycle
before insert or update on public.matchmaking_tickets
for each row execute function public.force_explicit_matchmaking_lifecycle();

drop trigger if exists force_explicit_pair_lifecycle on public.matchmaking_pairs;
create trigger force_explicit_pair_lifecycle
before insert or update on public.matchmaking_pairs
for each row execute function public.force_explicit_matchmaking_lifecycle();

drop trigger if exists force_explicit_group_lifecycle on public.matchmaking_groups;
create trigger force_explicit_group_lifecycle
before insert or update on public.matchmaking_groups
for each row execute function public.force_explicit_matchmaking_lifecycle();

create or replace function public.matchmaking_heartbeat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.matchmaking_tickets%rowtype;
begin
  -- Compatibility shim only. No heartbeat timestamp or row version is
  -- written; presence is ended by explicit exit instead.
  select * into v_ticket
  from public.matchmaking_tickets
  where user_id = p_user_id
    and state in ('searching','candidate_found','waiting_confirmation','matched','playing')
  order by created_at desc
  limit 1;
  return coalesce(to_jsonb(v_ticket), '{}'::jsonb)
    || jsonb_build_object('heartbeatDisabled', true);
end;
$$;

create or replace function public.matchmaking_expire_stale()
returns integer
language sql
security definer
set search_path = public
as $$
  select 0;
$$;

create or replace function public.matchmaking_expire_group_stale()
returns integer
language sql
security definer
set search_path = public
as $$
  select 0;
$$;

revoke all on function public.force_explicit_matchmaking_lifecycle() from public, anon, authenticated;
grant execute on function public.force_explicit_matchmaking_lifecycle() to service_role;
revoke all on function public.matchmaking_heartbeat(uuid) from public, anon, authenticated;
revoke all on function public.matchmaking_expire_stale() from public, anon, authenticated;
revoke all on function public.matchmaking_expire_group_stale() from public, anon, authenticated;
grant execute on function public.matchmaking_heartbeat(uuid) to service_role;
grant execute on function public.matchmaking_expire_stale() to service_role;
grant execute on function public.matchmaking_expire_group_stale() to service_role;
