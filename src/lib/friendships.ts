import { publicProfilesFor, type ReadContext } from "./data";
import { supabaseAdmin } from "./supabase";
import type { PublicProfile } from "./types";

type PendingFriendshipRow = { user_id: string; friend_id: string; created_at: string };
export type FriendRequestView = { user: PublicProfile; createdAt: string };

export function mapFriendshipRequests<T extends { id: string }>(
  profileId: string,
  rows: PendingFriendshipRow[],
  profiles: Map<string, T>
): { incoming: Array<{ user: T; createdAt: string }>; outgoing: Array<{ user: T; createdAt: string }> } {
  const incoming: Array<{ user: T; createdAt: string }> = [];
  const outgoing: Array<{ user: T; createdAt: string }> = [];
  for (const row of rows) {
    const isIncoming = row.friend_id === profileId;
    const otherId = isIncoming ? row.user_id : row.friend_id;
    const user = profiles.get(otherId);
    if (user) (isIncoming ? incoming : outgoing).push({ user, createdAt: row.created_at });
  }
  return { incoming, outgoing };
}

export async function friendRequestsFor(profileId: string, context?: ReadContext): Promise<{
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}> {
  const { data } = await supabaseAdmin()
    .from("friendships")
    .select("user_id,friend_id,created_at")
    .eq("status", "pending")
    .or(`user_id.eq.${profileId},friend_id.eq.${profileId}`)
    .order("created_at", { ascending: false });
  const rows = (data || []) as PendingFriendshipRow[];
  const ids = rows.map((row) => (row.user_id === profileId ? row.friend_id : row.user_id));
  const profiles = await publicProfilesFor(Array.from(new Set(ids)), {}, context);
  return mapFriendshipRequests(profileId, rows, new Map(profiles.map((profile) => [profile.id, profile])));
}
