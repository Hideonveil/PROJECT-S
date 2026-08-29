-- Idempotent, queryable results for Room mutations. The receipt and the
-- underlying lifecycle mutation commit in the same PostgreSQL transaction.

begin;

create table if not exists public.room_operation_receipts (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  action text not null check (action in ('recruitment','goodbye','slip','exit')),
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_id, operation_id)
);

create index if not exists room_operation_receipts_room_created_idx
  on public.room_operation_receipts(room_id, created_at desc);

alter table public.room_operation_receipts enable row level security;
revoke all on table public.room_operation_receipts from public, anon, authenticated;
grant select, insert, update on table public.room_operation_receipts to service_role;

create or replace function public.execute_room_operation(
  p_operation_id text,
  p_action text,
  p_room_id uuid,
  p_actor_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_hash text := md5(coalesce(p_payload, '{}'::jsonb)::text);
  v_receipt public.room_operation_receipts%rowtype;
  v_session public.sessions%rowtype;
  v_result jsonb;
  v_response jsonb;
  v_room_version bigint;
begin
  if coalesce(length(trim(p_operation_id)), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'OPERATION_ID_REQUIRED';
  end if;
  if p_action not in ('recruitment','goodbye','slip','exit') then
    raise exception using errcode = 'P0001', message = 'ROOM_OPERATION_UNSUPPORTED';
  end if;

  -- Serialize only this actor + operation id. Unrelated Room actions remain concurrent.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_operation_id, 0));

  select * into v_receipt
  from public.room_operation_receipts
  where actor_id = p_actor_id and operation_id = p_operation_id;

  if found then
    if v_receipt.room_id <> p_room_id
       or v_receipt.action <> p_action
       or v_receipt.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'OPERATION_ID_REUSED';
    end if;
    return v_receipt.response || jsonb_build_object('reused', true);
  end if;

  if p_action = 'recruitment' then
    v_result := public.toggle_room_recruitment_vote(
      p_room_id,
      p_actor_id,
      coalesce((v_payload->>'requested')::boolean, false),
      p_operation_id
    );
  else
    select * into v_session
    from public.sessions
    where room_id = p_room_id
    order by created_at desc
    limit 1
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'SESSION_NOT_FOUND';
    end if;

    if p_action = 'goodbye' then
      v_result := public.phase1_request_goodbye(
        v_session.id,
        p_actor_id,
        coalesce((v_payload->>'requested')::boolean, false),
        p_operation_id
      );
    elsif p_action = 'slip' then
      v_result := public.phase1_slip_room(v_session.id, p_actor_id, p_operation_id);
    else
      v_result := public.phase1_exit_room(v_session.id, p_actor_id, p_operation_id);
    end if;
  end if;

  select realtime_version into v_room_version from public.rooms where id = p_room_id;
  v_response := jsonb_build_object(
    'result', coalesce(v_result, '{}'::jsonb),
    'roomVersion', coalesce(v_room_version, 0),
    'reused', false
  );

  insert into public.room_operation_receipts(
    actor_id, operation_id, room_id, action, payload_hash, response
  ) values (
    p_actor_id, p_operation_id, p_room_id, p_action, v_payload_hash, v_response
  );

  return v_response;
end;
$$;

revoke all on function public.execute_room_operation(text,text,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.execute_room_operation(text,text,uuid,uuid,jsonb)
  to service_role;

commit;
