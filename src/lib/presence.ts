import { supabaseAdmin } from "./supabase";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
export const PRESENCE_TTL_SECONDS = 30;
export const ROOM_RECONNECT_GRACE_SECONDS = 180;

export function presenceCutoffIso(now = Date.now()): string {
  return new Date(now - PRESENCE_TTL_SECONDS * 1000).toISOString();
}

export function isEffectivelyOnline(
  profile: { online?: boolean | null; last_seen?: string | null },
  now = Date.now(),
): boolean {
  if (profile.online !== true || !profile.last_seen) return false;
  const lastSeen = Date.parse(profile.last_seen);
  return Number.isFinite(lastSeen) && lastSeen > now - PRESENCE_TTL_SECONDS * 1000;
}

export async function probePresence(signal?: AbortSignal) {
  let query = supabaseAdmin().from("profiles").select("id", { head: true }).limit(1);
  if (signal) query = query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;
  return true;
}

export async function reconcileStalePresence(signal?: AbortSignal) {
  let query = supabaseAdmin().rpc("presence_reconcile_stale", {
    p_limit: 200,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
