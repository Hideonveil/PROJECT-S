-- These helpers are called by trusted database functions and triggers. They
-- are implementation details, not public RPC endpoints.
revoke all on function public.matchmaking_log_transition(
  uuid, uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.matchmaking_sync_session_lifecycle()
  from public, anon, authenticated;

grant execute on function public.matchmaking_log_transition(
  uuid, uuid, uuid, text, text, text, text, jsonb
) to service_role;
