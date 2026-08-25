-- Keep heartbeat lightweight. Stale reconciliation remains owned by pg_cron.
--
-- The heartbeat still owns the profile lock, effective-online timestamp, and
-- Room reconnect-grace bookkeeping. It must not also scan and reconcile up to
-- 200 stale profiles for every online user or 10-second heartbeat.

begin;

create or replace function public.presence_heartbeat(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_member record;
begin
  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  -- If no other request observed the disconnect, decide the timeout from the
  -- previous server-side heartbeat before accepting this reconnect. This
  -- preserves the existing 180-second reconnect-grace semantics.
  for v_member in
    select rm.id, rm.room_id, rm.disconnected_at, s.id as session_id
      from public.room_members rm
      join public.sessions s on s.room_id = rm.room_id
     where rm.user_id = p_user_id
       and rm.status = 'active'
       and s.status in ('ready', 'playing')
  loop
    if (
      v_profile.last_seen is not null
      and v_profile.last_seen <= p_now - interval '180 seconds'
    ) or (
      v_profile.last_seen is null
      and v_member.disconnected_at is not null
      and v_member.disconnected_at <= p_now - interval '180 seconds'
    ) then
      perform public.phase1_timeout_leave(
        v_member.session_id,
        p_user_id,
        format('presence:reconnect-timeout:%s:%s', p_user_id, v_member.id)
      );
    end if;
  end loop;

  update public.profiles
     set online = true,
         last_seen = p_now
   where id = p_user_id;

  -- Reconnect wins before the cron-owned stale sweep runs. Only live Room
  -- memberships are cleared; terminal memberships remain untouched.
  update public.room_members rm
     set disconnected_at = null
   where rm.user_id = p_user_id
     and rm.status = 'active'
     and exists (
       select 1
         from public.sessions s
        where s.room_id = rm.room_id
          and s.status in ('ready', 'playing')
     );

  -- Deliberately no presence_reconcile_stale() here. The existing
  -- jiyuan-presence-reconcile pg_cron job remains the single stale-sweep owner.
  return jsonb_build_object('online', true, 'lastSeen', p_now);
end;
$$;

revoke all on function public.presence_heartbeat(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.presence_heartbeat(uuid, timestamptz) to service_role;

commit;
