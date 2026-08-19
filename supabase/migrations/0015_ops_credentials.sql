create table if not exists public.ops_credentials (
  id text primary key check (id = 'primary'),
  password_salt text not null,
  password_hash text not null,
  session_version integer not null default 1 check (session_version > 0),
  updated_at timestamptz not null default now()
);

alter table public.ops_credentials enable row level security;
revoke all on table public.ops_credentials from public, anon, authenticated;

comment on table public.ops_credentials is
  'Private service-role-only credential for the hidden operations dashboard.';
