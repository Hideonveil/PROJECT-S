import { supabaseAdmin } from "../supabase";

export function autoConnectRequestId(ticketA: string, ticketB: string) {
  return `auto-pair:${ticketA}:${ticketB}`;
}

export async function autoConnectPair(pairId: string, requestId: string | null = null) {
  const admin = supabaseAdmin();
  const { data: pair, error: pairError } = await admin
    .from("matchmaking_pairs")
    .select("id,user_a_id,user_b_id,state")
    .eq("id", pairId)
    .maybeSingle();
  if (pairError) throw pairError;
  if (!pair || ["playing", "matched", "completed"].includes(pair.state)) return pair;
  if (pair.state !== "waiting_confirmation") return pair;

  for (const userId of [pair.user_a_id, pair.user_b_id]) {
    const { error } = await admin.rpc("matchmaking_confirm_pair", {
      p_pair_id: pair.id,
      p_user_id: userId,
      p_decision: "accepted",
      p_request_id: `${requestId || `auto-pair:${pair.id}`}:${userId}`,
    });
    if (error) throw error;
  }
  return pair;
}
