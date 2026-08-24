-- Optimize auth helper evaluation without changing RLS semantics.
--
-- Each auth.uid() call is statement-stable. Wrapping it in a scalar SELECT
-- lets PostgreSQL evaluate it once as an initplan instead of once per row.
-- The policy predicates, roles, commands, and accessible row sets remain the
-- same as the production definitions verified before this migration.

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth_user_id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists "sessions_select_participant" on public.sessions;
create policy "sessions_select_participant" on public.sessions
  for select to authenticated
  using (
    exists (
      select 1
      from jsonb_array_elements_text(public.sessions.players) p
      where p = (
        select id::text
        from public.profiles
        where auth_user_id = (select auth.uid())
        limit 1
      )
    )
  );
