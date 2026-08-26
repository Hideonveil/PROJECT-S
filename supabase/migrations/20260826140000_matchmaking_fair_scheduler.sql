-- Fair, bounded scheduling for the persistent matcher.
--
-- A wake timestamp is intentionally separate from updated_at: telemetry and
-- cooldown writes must never make an unchanged ticket look newly actionable.

begin;

alter table public.matchmaking_tickets
  add column if not exists matcher_wake_at timestamptz null,
  add column if not exists consecutive_match_errors integer not null default 0,
  add column if not exists matcher_quarantined_at timestamptz null;

create index if not exists matchmaking_fresh_scheduler_idx
  on public.matchmaking_tickets (matcher_wake_at desc, next_match_attempt_at)
  where state = 'searching';

create index if not exists matchmaking_regular_scheduler_idx
  on public.matchmaking_tickets (next_match_attempt_at, search_started_at)
  where state = 'searching';

create or replace function public.matchmaking_wake_search_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.matcher_wake_at := now();
    new.next_match_attempt_at := null;
    new.last_match_outcome := 'AWAKENED';
    new.last_match_target_id := null;
    new.consecutive_conflicts := 0;
    new.consecutive_match_errors := 0;
    new.matcher_quarantined_at := null;
  elsif new.state = 'searching' and (
    old.state is distinct from new.state
    or old.group_id is distinct from new.group_id
    or old.pair_id is distinct from new.pair_id
  ) then
    new.matcher_wake_at := now();
    new.next_match_attempt_at := null;
    new.last_match_outcome := 'AWAKENED';
    new.last_match_target_id := null;
    new.consecutive_conflicts := 0;
    new.consecutive_match_errors := 0;
    new.matcher_quarantined_at := null;
  end if;
  return new;
end;
$$;

-- Trigger functions are not an application RPC surface. SECURITY DEFINER is
-- used only so the trigger can normalize durable scheduler fields; remove the
-- default PUBLIC execute grant explicitly.
revoke all on function public.matchmaking_wake_search_ticket() from public, anon, authenticated;

-- Only pool-relevant writes wake a ticket. This makes a newly-created or
-- genuinely changed ticket immediately eligible without letting ordinary
-- telemetry updates turn the persistent matcher into a busy loop.
drop trigger if exists matchmaking_wake_search_ticket_trigger on public.matchmaking_tickets;
create trigger matchmaking_wake_search_ticket_trigger
before insert or update of state, group_id, pair_id on public.matchmaking_tickets
for each row execute function public.matchmaking_wake_search_ticket();

commit;
