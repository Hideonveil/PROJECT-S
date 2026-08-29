-- Read one Room lifecycle projection from one PostgreSQL statement snapshot.
-- Profile presentation remains an application concern; lifecycle truth does not.

begin;

create or replace function public.read_room_projection(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target_room as (
    select r.*
    from public.rooms r
    where r.id = p_room_id
  ), latest_session as (
    select s.*
    from public.sessions s
    where s.room_id = p_room_id
    order by s.created_at desc
    limit 1
  ), linked_pair as (
    select p.*
    from public.matchmaking_pairs p
    where p.room_id = p_room_id
       or p.session_id = (select id from latest_session)
    order by p.created_at desc
    limit 1
  ), linked_group as (
    select g.*
    from public.matchmaking_groups g
    where g.room_id = p_room_id
    order by g.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'room', to_jsonb(r),
    'roomVersion', coalesce(r.realtime_version, 0),
    'membershipVersion', coalesce(r.room_membership_version, 1),
    'members', coalesce((
      select jsonb_agg(to_jsonb(rm) order by rm.joined_at)
      from public.room_members rm
      where rm.room_id = r.id
    ), '[]'::jsonb),
    'session', (select to_jsonb(s) from latest_session s),
    'pair', (select to_jsonb(p) from linked_pair p),
    'group', (select to_jsonb(g) from linked_group g),
    'tickets', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.matchmaking_tickets t
      where t.room_id = r.id
         or t.id in (
           select p.ticket_a_id from linked_pair p
           union
           select p.ticket_b_id from linked_pair p
         )
         or t.id in (
           select gm.ticket_id
           from public.matchmaking_group_members gm
           where gm.group_id = (select id from linked_group)
         )
    ), '[]'::jsonb),
    'recruitmentVotes', coalesce((
      select jsonb_agg(to_jsonb(rv) order by rv.requested_at)
      from public.room_recruitment_votes rv
      where rv.room_id = r.id
    ), '[]'::jsonb),
    'goodbyeRequests', coalesce((
      select jsonb_agg(to_jsonb(gr) order by gr.requested_at)
      from public.session_goodbye_requests gr
      where gr.session_id = (select id from latest_session)
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(to_jsonb(st) order by st.settled_at)
      from public.session_participant_settlements st
      where st.session_id = (select id from latest_session)
    ), '[]'::jsonb),
    'generatedAt', now()
  )
  from target_room r;
$$;

revoke all on function public.read_room_projection(uuid) from public, anon, authenticated;
grant execute on function public.read_room_projection(uuid) to service_role;

commit;
