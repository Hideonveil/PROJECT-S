/**
 * Start the bounded matcher in the long-lived Node process. The matcher only
 * scans durable searching tickets; it does not hold user sessions or perform
 * player actions on their behalf.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The isolated interactive prototype runs without Supabase configuration.
  // Keep the production default unchanged, but allow local preview servers to
  // opt out of the background matcher entirely.
  if (process.env.MATCHMAKING_SWEEP_DISABLED === "true") return;
  const { startPersistentMatcher } = await import("./lib/matchmaking/service");
  startPersistentMatcher();
}
