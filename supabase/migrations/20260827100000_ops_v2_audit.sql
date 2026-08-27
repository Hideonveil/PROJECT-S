begin;

create table if not exists public.ops_audit_log (
  id bigint generated always as identity primary key,
  operator text not null,
  action text not null,
  target_user_id uuid null,
  target_room_id uuid null,
  before_state jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_log_created_at_idx on public.ops_audit_log (created_at desc);
create index if not exists ops_audit_log_action_created_at_idx on public.ops_audit_log (action, created_at desc);
create index if not exists ops_audit_log_target_user_id_idx on public.ops_audit_log (target_user_id) where target_user_id is not null;
create index if not exists ops_audit_log_target_room_id_idx on public.ops_audit_log (target_room_id) where target_room_id is not null;

alter table public.ops_audit_log enable row level security;
revoke all on table public.ops_audit_log from public, anon, authenticated;
grant select, insert on table public.ops_audit_log to service_role;

comment on table public.ops_audit_log is
  'Append-only record of protected Jiyuan OPS V2 actions; never stores credentials or tokens.';

commit;
