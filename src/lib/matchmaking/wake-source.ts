import { supabaseAdmin } from "../supabase";

/**
 * Realtime is only a wake signal. Durable tickets/groups remain the matcher
 * source of truth and the scheduler still performs a bounded safety sweep.
 */
export function startMatcherWakeSource(onWake: (reason: string) => void) {
  const client = supabaseAdmin();
  const channel = client
    .channel(`matcher-wake-${process.pid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "matchmaking_tickets" }, () => onWake("ticket-inserted"))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matchmaking_groups" }, () => onWake("group-changed"))
    .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_group_members" }, () => onWake("group-membership-changed"));
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onWake("subscription-ready");
  });
  return () => { void client.removeChannel(channel); };
}
