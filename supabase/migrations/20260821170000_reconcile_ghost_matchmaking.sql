-- Reconcile matchmaking tickets whenever their pair/group has already ended.
--
-- A cancellation can arrive after the other ticket's TTL.  The old RPCs only
-- released a partner when expires_at > now(), leaving an active
-- waiting_confirmation ticket pointing at a cancelled pair.  That ticket was
-- then returned by /api/state and blocked the next match.

create or replace function public.matchmaking_reconcile_terminal_pair_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state not in ('cancelled', 'expired', 'completed')
     or old.state is not distinct from new.state then
    return new;
  end if;

  -- Only pre-room tickets may return to the pool.  Matched/playing tickets
  -- are owned by the room/session lifecycle and must not be reopened here.
  update public.matchmaking_tickets
  set state = case when expires_at > now() then 'searching' else 'expired' end,
      pair_id = null,
      confirmation_deadline = null,
      closed_at = case when expires_at > now() then closed_at else coalesce(closed_at, now()) end,
      cancel_reason = case when expires_at > now() then null else coalesce(cancel_reason, 'stale') end,
      updated_at = now(),
      version = version + 1
  where pair_id = new.id
    and state in ('searching', 'candidate_found', 'waiting_confirmation');

  return new;
end;
$$;

drop trigger if exists matchmaking_pair_terminal_ticket_reconcile on public.matchmaking_pairs;
create trigger matchmaking_pair_terminal_ticket_reconcile
after update of state on public.matchmaking_pairs
for each row
execute function public.matchmaking_reconcile_terminal_pair_tickets();

create or replace function public.matchmaking_reconcile_terminal_group_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state not in ('cancelled', 'expired', 'completed')
     or old.state is not distinct from new.state then
    return new;
  end if;

  update public.matchmaking_tickets
  set state = case when expires_at > now() then 'searching' else 'expired' end,
      group_id = null,
      confirmation_deadline = null,
      closed_at = case when expires_at > now() then closed_at else coalesce(closed_at, now()) end,
      cancel_reason = case when expires_at > now() then null else coalesce(cancel_reason, 'stale') end,
      updated_at = now(),
      version = version + 1
  where group_id = new.id
    and state in ('searching', 'candidate_found', 'waiting_confirmation');

  return new;
end;
$$;

drop trigger if exists matchmaking_group_terminal_ticket_reconcile on public.matchmaking_groups;
create trigger matchmaking_group_terminal_ticket_reconcile
after update of state on public.matchmaking_groups
for each row
execute function public.matchmaking_reconcile_terminal_group_tickets();

-- The trigger handles future terminal transitions.  This maintenance RPC also
-- repairs rows that were orphaned before the trigger existed and expires
-- tickets whose TTL elapsed without a later request.
create or replace function public.matchmaking_expire_stale()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
  v_pair record;
  v_ticket record;
begin
  -- Confirmation deadlines are authoritative while a pair is still open.
  for v_pair in
    select *
    from public.matchmaking_pairs
    where state in ('candidate_found', 'waiting_confirmation')
      and confirmation_deadline <= now()
    for update skip locked
  loop
    update public.matchmaking_pairs
    set state = 'expired',
        cancel_reason = 'confirmation_timeout',
        updated_at = now(),
        version = version + 1
    where id = v_pair.id;
    -- The terminal-pair trigger has detached all pre-room tickets.  Keep this
    -- update for compatibility with databases where the trigger is not yet
    -- installed during an in-place migration.
    update public.matchmaking_tickets
    set state = case when expires_at > now() then 'searching' else 'expired' end,
        pair_id = null,
        confirmation_deadline = null,
        closed_at = case when expires_at > now() then closed_at else coalesce(closed_at, now()) end,
        cancel_reason = case when expires_at > now() then null else coalesce(cancel_reason, 'stale') end,
        updated_at = now(),
        version = version + 1
    where pair_id = v_pair.id
      and state in ('searching', 'candidate_found', 'waiting_confirmation');
    v_count := v_count + 1;
  end loop;

  -- A ticket TTL can expire before the pair confirmation deadline.  End that
  -- pair first so its partner cannot remain linked to a terminal pair.
  update public.matchmaking_pairs p
  set state = 'expired',
      cancel_reason = coalesce(p.cancel_reason, 'ticket_expired'),
      updated_at = now(),
      version = p.version + 1
  where p.state in ('candidate_found', 'waiting_confirmation')
    and exists (
      select 1
      from public.matchmaking_tickets t
      where t.pair_id = p.id
        and t.state in ('candidate_found', 'waiting_confirmation')
        and t.expires_at <= now()
    );

  -- Expire unpaired tickets whose TTL elapsed.  Group tickets are reconciled
  -- by the companion group maintenance RPC/trigger.
  update public.matchmaking_tickets t
  set state = 'expired',
      pair_id = null,
      confirmation_deadline = null,
      closed_at = coalesce(t.closed_at, now()),
      cancel_reason = coalesce(t.cancel_reason, 'stale'),
      updated_at = now(),
      version = t.version + 1
  where t.group_id is null
    and t.state in ('searching', 'candidate_found', 'waiting_confirmation')
    and t.expires_at <= now();
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Repair the exact historical ghost shape: an active ticket still points at
  -- a cancelled/expired/completed (or missing) pair.
  for v_ticket in
    select t.*
    from public.matchmaking_tickets t
    left join public.matchmaking_pairs p on p.id = t.pair_id
    where t.group_id is null
      and t.pair_id is not null
      and t.state in ('searching', 'candidate_found', 'waiting_confirmation', 'matched', 'playing')
      and (p.id is null or p.state in ('cancelled', 'expired', 'completed'))
    for update of t skip locked
  loop
    update public.matchmaking_tickets
    set state = case
          when v_ticket.state in ('matched', 'playing') then 'cancelled'
          when v_ticket.expires_at > now() then 'searching'
          else 'expired'
        end,
        pair_id = null,
        confirmation_deadline = null,
        closed_at = case
          when v_ticket.state in ('matched', 'playing') or v_ticket.expires_at <= now()
            then coalesce(v_ticket.closed_at, now())
          else v_ticket.closed_at
        end,
        cancel_reason = case
          when v_ticket.state in ('matched', 'playing') or v_ticket.expires_at <= now()
            then coalesce(v_ticket.cancel_reason, 'pair_terminal')
          else null
        end,
        updated_at = now(),
        version = v_ticket.version + 1
    where id = v_ticket.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.matchmaking_reconcile_terminal_pair_tickets() from public, anon, authenticated;
revoke all on function public.matchmaking_reconcile_terminal_group_tickets() from public, anon, authenticated;
grant execute on function public.matchmaking_reconcile_terminal_pair_tickets() to service_role;
grant execute on function public.matchmaking_reconcile_terminal_group_tickets() to service_role;
revoke all on function public.matchmaking_expire_stale() from public, anon, authenticated;
grant execute on function public.matchmaking_expire_stale() to service_role;

-- Repair existing production ghosts as part of applying this migration.
select public.matchmaking_expire_stale();
