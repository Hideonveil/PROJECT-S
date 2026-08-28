import { supabaseAdmin } from "../supabase";
import type { MatchmakingTicketRow } from "./records";

const ACTIVE_TICKET_STATES = [
  "searching",
  "candidate_found",
  "waiting_confirmation",
  "matched",
  "playing",
] as const;

export async function activeTicketRow(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("matchmaking_tickets")
    .select("*")
    .eq("user_id", userId)
    .in("state", [...ACTIVE_TICKET_STATES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  // expires_at is intentionally ignored. Active rows close only through an
  // explicit cancel, leave or offline lifecycle action.
  return data as MatchmakingTicketRow | null;
}
