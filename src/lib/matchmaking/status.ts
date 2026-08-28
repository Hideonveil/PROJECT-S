import { publicProfilesFor } from "../data";
import { supabaseAdmin } from "../supabase";
import { groupSnapshot } from "./casual";
import { activeTicketRow } from "./ticket-store";

export async function matchmakingStatus(userId: string) {
  const admin = supabaseAdmin();
  const ticket = await activeTicketRow(userId);

  const [{ count: matching }, { count: matchable }, { data: directoryRows }] = await Promise.all([
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching"),
    admin.from("matchmaking_tickets").select("id", { count: "exact", head: true }).eq("state", "searching").eq("game_id", "deadlock"),
    admin
      .from("matchmaking_tickets")
      .select("id,user_id,game_id,mode,rank_code,desired_roles,microphone_preference,search_started_at")
      .eq("state", "searching")
      .eq("game_id", "deadlock")
      .neq("user_id", userId)
      .order("search_started_at", { ascending: true })
      .limit(8),
  ]);

  const directoryTickets = (directoryRows || []) as Array<Record<string, any>>;
  const directoryProfiles = await publicProfilesFor(directoryTickets.map((row) => row.user_id), { onlineOnly: true });
  const directoryProfileById = new Map(directoryProfiles.map((profile) => [profile.id, profile]));
  const directory = directoryTickets
    .filter((row) => directoryProfileById.has(row.user_id))
    .map((row) => ({
      ticketId: row.id,
      nickname: directoryProfileById.get(row.user_id)?.nickname || "玩家",
      gameId: row.game_id || "deadlock",
      mode: row.mode,
      rankCode: row.rank_code || null,
      desiredRoles: row.desired_roles || [],
      microphonePreference: row.microphone_preference || "any",
    }));

  if (!ticket) return { ticket: null, pair: null, group: null, candidate: null, matching: matching || 0, matchable: matchable || 0, directory };
  let ticketRoomCode: string | null = null;
  if (ticket.room_id) {
    const { data: room } = await admin.from("rooms").select("code").eq("id", ticket.room_id).maybeSingle();
    ticketRoomCode = room?.code || null;
  }
  let pair: Record<string, any> | null = null;
  let candidate = null;
  const group = ticket.group_id ? await groupSnapshot(ticket.group_id, userId) : null;
  if (ticket.pair_id) {
    const { data, error } = await admin.from("matchmaking_pairs").select("*").eq("id", ticket.pair_id).maybeSingle();
    if (error) throw error;
    pair = data;
    if (pair) {
      const candidateId = pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
      const candidateTicketId = pair.ticket_a_id === ticket?.id ? pair.ticket_b_id : pair.ticket_a_id;
      const [{ data: candidateTicket, error: candidateTicketError }, candidateProfiles] = await Promise.all([
        admin.from("matchmaking_tickets").select("id,rank_code,microphone_preference,mode").eq("id", candidateTicketId).maybeSingle(),
        publicProfilesFor([candidateId]),
      ]);
      if (candidateTicketError) throw candidateTicketError;
      const candidateProfile = candidateProfiles[0] || null;
      candidate = candidateProfile ? {
        ...candidateProfile,
        rankCode: candidateTicket?.rank_code || null,
        microphonePreference: candidateTicket?.microphone_preference || "any",
        mode: candidateTicket?.mode || "ranked",
      } : null;
      const { data: confirmations } = await admin.from("matchmaking_confirmations").select("user_id,decision,responded_at").eq("pair_id", pair.id);
      let roomCode: string | null = null;
      if (pair.room_id) {
        const { data: room } = await admin.from("rooms").select("code").eq("id", pair.room_id).maybeSingle();
        roomCode = room?.code || null;
      }
      pair = { ...pair, confirmations: confirmations || [], roomCode };
    }
  }
  return { ticket: { ...ticket, roomCode: ticketRoomCode }, pair, group, candidate, matching: matching || 0, matchable: matchable || 0, directory };
}
