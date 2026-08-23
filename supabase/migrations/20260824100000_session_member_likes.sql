-- Per-member post-session likes.
-- This is intentionally a new forward-only table. Historical session_responses
-- and matchmaking_feedback tags are not backfilled or rewritten.
create table if not exists public.session_member_likes (
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create index if not exists session_member_likes_from_user_idx
  on public.session_member_likes (from_user_id, created_at desc);

create index if not exists session_member_likes_to_user_idx
  on public.session_member_likes (to_user_id, created_at desc);

alter table public.session_member_likes enable row level security;

drop policy if exists "session_member_likes_select_own" on public.session_member_likes;
create policy "session_member_likes_select_own" on public.session_member_likes
  for select to authenticated
  using (from_user_id = public.current_profile_id());

drop policy if exists "session_member_likes_insert_own" on public.session_member_likes;
create policy "session_member_likes_insert_own" on public.session_member_likes
  for insert to authenticated
  with check (
    from_user_id = public.current_profile_id()
    and from_user_id <> to_user_id
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.status = 'completed'
        and s.players ? from_user_id::text
        and s.players ? to_user_id::text
    )
  );

drop policy if exists "session_member_likes_delete_own" on public.session_member_likes;
create policy "session_member_likes_delete_own" on public.session_member_likes
  for delete to authenticated
  using (from_user_id = public.current_profile_id());

do $$
begin
  alter publication supabase_realtime add table public.session_member_likes;
exception
  when duplicate_object then null;
end;
$$;
