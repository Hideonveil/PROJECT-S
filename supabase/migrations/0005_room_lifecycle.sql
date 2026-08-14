-- Room lifecycle, RLS recursion fix, game accounts and recent connections.
-- Idempotent: safe to run in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- profiles: per-game account info (Steam friend code, Riot ID, UID, game ID)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists game_accounts jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- room_members: allow a player to exit without closing the room
-- ---------------------------------------------------------------------------
alter table public.room_members add column if not exists status text not null default 'active';
alter table public.room_members add column if not exists exited_at timestamptz null;

-- ---------------------------------------------------------------------------
-- rooms: playing -> completed when all players exit
-- ---------------------------------------------------------------------------
alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check check (
  status in ('connecting', 'ready', 'playing', 'finished', 'completed', 'closed')
);
alter table public.rooms add column if not exists completed_at timestamptz null;

-- ---------------------------------------------------------------------------
-- recent_connections: a real played session, not an automatic friend
-- ---------------------------------------------------------------------------
create table if not exists public.recent_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  room_id uuid null references public.rooms(id) on delete set null,
  played_at timestamptz not null default now(),
  play_count integer not null default 1,
  rating text null,
  want_again boolean null,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id, room_id)
);

create index if not exists recent_connections_user_played_idx
  on public.recent_connections (user_id, played_at desc);
create index if not exists recent_connections_friend_idx
  on public.recent_connections (friend_id);

drop policy if exists "recent_connections_select_own" on public.recent_connections;
create policy "recent_connections_select_own"
  on public.recent_connections
  for select to authenticated
  using (user_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- applications: only one pending request per player pair, either direction
-- ---------------------------------------------------------------------------
update public.applications a
set status = 'declined'
from public.applications b
where a.id > b.id
  and a.status = 'pending'
  and b.status = 'pending'
  and least(a.from_user_id, a.to_user_id) = least(b.from_user_id, b.to_user_id)
  and greatest(a.from_user_id, a.to_user_id) = greatest(b.from_user_id, b.to_user_id);

create unique index if not exists applications_pending_pair_unique
  on public.applications (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id)
  )
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS helper: avoid recursive room_members policy
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room_id
      and rm.user_id = public.current_profile_id()
      and rm.status = 'active'
  )
$$;

grant execute on function public.is_room_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace recursive room_members policy with the security-definer helper
-- ---------------------------------------------------------------------------
drop policy if exists "room_members_select_own" on public.room_members;
create policy "room_members_select_own" on public.room_members
  for select to authenticated
  using (user_id = public.current_profile_id() or public.is_room_member(room_id));

drop policy if exists "rooms_select_member" on public.rooms;
create policy "rooms_select_member" on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages
  for insert to authenticated
  with check (
    sender_id = public.current_profile_id()
    and public.is_room_member(room_id)
  );
