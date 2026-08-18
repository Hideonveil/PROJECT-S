-- A normal goodbye creates history and feedback. An explicit room exit is
-- abnormal, cancels the session, and must not create a recent connection.
alter table public.session_responses
  add column if not exists liked boolean null;

create or replace function public.phase1_exit_room(
  p_session_id uuid,
  p_actor_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or not (v_session.players ? p_actor_id::text) then
    raise exception using errcode = '42501', message = 'SESSION_FORBIDDEN';
  end if;

  update public.room_members
  set status = 'exited', exited_at = coalesce(exited_at, now())
  where room_id = v_session.room_id and user_id = p_actor_id;

  if v_session.status in ('ready', 'playing') then
    update public.sessions
    set status = 'cancelled', ended_at = coalesce(ended_at, now()),
        completion_reason = 'member_exited', completed_by = p_actor_id,
        version = version + 1
    where id = v_session.id
    returning * into v_session;

  end if;

  -- Keep the room visible to the remaining participant so the UI can explain
  -- that the other player left. Close the shell after the final member exits.
  if not exists (
    select 1 from public.room_members
    where room_id = v_session.room_id and status = 'active'
  ) then
    update public.rooms
    set status = 'cancelled', completed_at = coalesce(completed_at, now())
    where id = v_session.room_id;
  end if;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.phase1_exit_room(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.phase1_exit_room(uuid, uuid, text) to service_role;
