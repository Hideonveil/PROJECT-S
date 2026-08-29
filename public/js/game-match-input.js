/**
 * @param {{
 *   game: Record<string, any>,
 *   mode: "ranked" | "casual",
 *   rankCode?: string | null,
 *   ownRoles?: number[],
 *   teammateRoles?: number[],
 *   microphonePreference?: string,
 *   preferredTotalPlayers?: number | null
 * }} options
 */
export function buildGameMatchInput({
  game,
  mode,
  rankCode = null,
  ownRoles = [],
  teammateRoles = [],
  microphonePreference = "any",
  preferredTotalPlayers = null,
}) {
  if (!game?.id || !game.modes?.[mode]?.enabled) throw new Error("GAME_MODE_NOT_AVAILABLE");
  const positionCodes = new Set((game.positionOptions || []).map((position) => Number(position.code)));
  const normalizeRoles = (roles) => Array.from(new Set((roles || []).map(Number).filter((role) => positionCodes.has(role))));
  const normalizedOwnRoles = normalizeRoles(ownRoles);
  const normalizedTeammateRoles = normalizeRoles(teammateRoles);
  const desiredRoles = Array.from(new Set([...normalizedOwnRoles, ...normalizedTeammateRoles]));
  const casual = mode === "casual";
  return {
    gameId: game.id,
    mode,
    rankCode: casual ? null : rankCode || null,
    desiredRoles,
    ownRoles: normalizedOwnRoles,
    teammateRoles: normalizedTeammateRoles,
    microphonePreference: ["on", "off", "any"].includes(microphonePreference) ? microphonePreference : "any",
    // The server owns casual defaults and bounds. The browser sends only the
    // player's soft preference so a future game cannot acquire a second,
    // client-side copy of its matchmaking rules.
    preferredTotalPlayers: casual && preferredTotalPlayers ? Number(preferredTotalPlayers) : undefined,
  };
}
