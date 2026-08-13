-- NODE Web MVP - complete schema, seed data, RLS and Realtime
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id text primary key,
  name text not null,
  tag text not null default '',
  modes jsonb not null default '[]'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  devices jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.games (id, name, tag, modes, roles, devices) values
  ('minecraft', '我的世界', '沙盒', '["生存联机","模组生存","建筑协作","红石工程"]', '["生存玩家","建筑师","红石工程师"]', '["PC","主机","手机"]'),
  ('stardew', '星露谷物语', '模拟', '["多人农场","矿洞探险","节日活动"]', '["农场主","矿工","渔夫"]', '["PC","主机","手机"]'),
  ('pubg', 'PUBG', '射击', '["四排","双排","单人"]', '["突击手","狙击手","侦察"]', '["PC","主机","手机"]'),
  ('valorant', '无畏契约', 'FPS', '["排位赛","极速模式","自定义训练"]', '["决斗者","先锋","控场者","哨兵"]', '["PC"]'),
  ('hok', '王者荣耀', 'MOBA', '["排位赛","巅峰赛","娱乐模式"]', '["对抗路","打野","中路","发育路","游走"]', '["手机"]'),
  ('league', '英雄联盟', 'MOBA', '["排位赛","灵活组排","大乱斗"]', '["上单","打野","中单","下路","辅助"]', '["PC"]')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_key text not null default 'me-1',
  device text not null default 'PC',
  play_style text not null default '',
  voice boolean not null default true,
  online boolean not null default false,
  last_seen timestamptz null,
  friend_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists profiles_online_idx on public.profiles (online);

-- ---------------------------------------------------------------------------
-- user_games
-- ---------------------------------------------------------------------------
create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  role text not null default '',
  level integer not null default 60,
  win_rate text not null default '50%',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists user_games_user_id_idx on public.user_games (user_id);

-- ---------------------------------------------------------------------------
-- match_requests
-- ---------------------------------------------------------------------------
create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  activity text not null default '',
  goal text not null default '',
  current_player_count integer not null default 1,
  needed_player_count integer not null default 2,
  play_time text not null default '现在开始',
  duration text not null default '90',
  voice_required boolean not null default true,
  desired_player_type text not null default '',
  status text not null default 'matching' check (status in ('matching','matched','cancelled','expired','playing','completed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz null
);

create index if not exists match_requests_status_idx on public.match_requests (status);
create index if not exists match_requests_game_idx on public.match_requests (game_id);
create index if not exists match_requests_user_idx on public.match_requests (user_id);
-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  request_a uuid not null references public.match_requests(id) on delete cascade,
  request_b uuid not null references public.match_requests(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists matches_request_a_idx on public.matches (request_a);
create index if not exists matches_request_b_idx on public.matches (request_b);
create index if not exists matches_status_idx on public.matches (status);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  match_request_id uuid null references public.match_requests(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);

create index if not exists applications_to_idx on public.applications (to_user_id, status);
create index if not exists applications_from_idx on public.applications (from_user_id);

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  application_id uuid null references public.applications(id) on delete set null,
  need jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('connecting','ready','playing','finished')),
  started_at timestamptz null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- room_members
-- ---------------------------------------------------------------------------
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members (user_id);
-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_id_created_at_idx on public.messages (room_id, created_at);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  players jsonb not null default '[]'::jsonb,
  need jsonb not null default '{}'::jsonb,
  outcome_by jsonb not null default '{}'::jsonb,
  rematch_by jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now()
);

create index if not exists sessions_room_code_idx on public.sessions (room_code);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

create index if not exists friendships_user_idx on public.friendships (user_id);

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete set null,
  username text null,
  user_email text null,
  feedback_type text not null check (
    feedback_type in ('bug', 'suggestion', 'other', '产品建议', '功能需求', 'Bug', '匹配问题', '聊天问题', '登录问题', '其他')
  ),
  content text not null check (char_length(content) between 10 and 2000),
  contact_email text null,
  current_page text null,
  current_game text null,
  current_match_request_id uuid null,
  user_agent text null,
  created_at timestamptz not null default now(),
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz null,
  email_error text null,
  request_id text null unique
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_type_idx on public.feedback (feedback_type);
create index if not exists feedback_failed_email_idx on public.feedback (email_status) where email_status = 'failed';

-- ---------------------------------------------------------------------------
-- helper: current profile id from auth.uid()
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.profiles enable row level security;
alter table public.user_games enable row level security;
alter table public.match_requests enable row level security;
alter table public.applications enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.friendships enable row level security;
alter table public.feedback enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;

-- games: everyone can read the catalog
create policy "games_select" on public.games for select to anon, authenticated using (true);

-- profiles: all signed-in players are visible (matching pool / player pages)
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth_user_id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- user_games: visible to all signed-in players, editable by owner
create policy "user_games_select" on public.user_games for select to authenticated using (true);
create policy "user_games_insert_own" on public.user_games for insert to authenticated with check (user_id = public.current_profile_id());
create policy "user_games_update_own" on public.user_games for update to authenticated using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
create policy "user_games_delete_own" on public.user_games for delete to authenticated using (user_id = public.current_profile_id());

-- match_requests: pool is visible to all signed-in players
create policy "match_requests_select" on public.match_requests for select to authenticated using (true);
create policy "match_requests_insert_own" on public.match_requests for insert to authenticated with check (user_id = public.current_profile_id());
create policy "match_requests_update_own" on public.match_requests for update to authenticated using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
create policy "match_requests_delete_own" on public.match_requests for delete to authenticated using (user_id = public.current_profile_id());

-- applications: only the two involved players can see or act on a request
create policy "applications_select_involved" on public.applications for select to authenticated using (from_user_id = public.current_profile_id() or to_user_id = public.current_profile_id());
create policy "applications_insert_own" on public.applications for insert to authenticated with check (from_user_id = public.current_profile_id());
create policy "applications_update_involved" on public.applications for update to authenticated using (from_user_id = public.current_profile_id() or to_user_id = public.current_profile_id()) with check (from_user_id = public.current_profile_id() or to_user_id = public.current_profile_id());
-- matches: participants can see the match record
create policy "matches_select_involved" on public.matches for select to authenticated using (
  exists (
    select 1 from public.match_requests mr
    where mr.id in (public.matches.request_a, public.matches.request_b)
      and mr.user_id = public.current_profile_id()
  )
);

-- rooms: only members can see the room
create policy "rooms_select_member" on public.rooms for select to authenticated using (exists (
  select 1 from public.room_members rm where rm.room_id = public.rooms.id and rm.user_id = public.current_profile_id()
));

-- room_members: a player can see rows they belong to, plus other members of their rooms
create policy "room_members_select_own" on public.room_members for select to authenticated using (
  user_id = public.current_profile_id()
  or room_id in (
    select room_id from public.room_members where user_id = public.current_profile_id()
  )
);
-- messages: room members can read and send messages
create policy "messages_select_member" on public.messages for select to authenticated using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = public.messages.room_id and rm.user_id = public.current_profile_id()
  )
);
create policy "messages_insert_member" on public.messages for insert to authenticated with check (
  sender_id = public.current_profile_id()
  and exists (
    select 1 from public.room_members rm
    where rm.room_id = public.messages.room_id and rm.user_id = public.current_profile_id()
  )
);

-- sessions: only participants can see the session
create policy "sessions_select_participant" on public.sessions for select to authenticated using (
  exists (
    select 1 from jsonb_array_elements_text(public.sessions.players) p
    where p = (select id::text from public.profiles where auth_user_id = auth.uid() limit 1)
  )
);

-- friendships: each player can only see their own rows
create policy "friendships_select_own" on public.friendships for select to authenticated using (user_id = public.current_profile_id());
create policy "friendships_insert_own" on public.friendships for insert to authenticated with check (user_id = public.current_profile_id());
create policy "friendships_update_own" on public.friendships for update to authenticated using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
create policy "friendships_delete_own" on public.friendships for delete to authenticated using (user_id = public.current_profile_id());

-- feedback: create/read own only; email delivery columns are server-only
create policy "feedback_insert_own" on public.feedback for insert to authenticated with check (user_id = public.current_profile_id());
create policy "feedback_select_own" on public.feedback for select to authenticated using (user_id = public.current_profile_id());
create policy "feedback_insert_anon" on public.feedback for insert to anon with check (user_id is null);

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.match_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.applications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.room_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;