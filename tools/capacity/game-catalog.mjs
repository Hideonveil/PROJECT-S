function availableGame(game) {
  return game?.status === "available" && game?.modes?.ranked?.enabled && game?.modes?.casual?.enabled;
}

export function selectCapacityGame(catalog, requestedGameId = "") {
  if (!Array.isArray(catalog)) throw new Error("CAPACITY_GAME: public game catalog is missing");
  const game = requestedGameId
    ? catalog.find((candidate) => candidate?.id === requestedGameId && availableGame(candidate))
    : catalog.find(availableGame);
  if (!game) throw new Error(`CAPACITY_GAME: no available game${requestedGameId ? ` named ${requestedGameId}` : ""}`);
  return game;
}

function selectedRoles(actor, game) {
  const configured = actor?.match?.desiredRoles || actor?.match?.ownRoles;
  if (Array.isArray(configured) && configured.length) return configured.map(Number);
  const firstPosition = Number(game.positionOptions?.[0]?.code);
  return Number.isFinite(firstPosition) ? [firstPosition] : [];
}

export function buildCapacityMatchInput(actor, game) {
  if (!game?.id) throw new Error("CAPACITY_GAME: game definition is required");
  const role = String(actor?.role || actor?.mode || "").toLowerCase();
  if (role === "ranked") {
    const roles = selectedRoles(actor, game);
    return {
      gameId: game.id,
      mode: "ranked",
      rankCode: actor.match?.rankCode || game.rankOptions?.[0]?.code || null,
      desiredRoles: roles,
      ownRoles: roles,
      teammateRoles: roles,
      microphonePreference: actor.match?.microphonePreference || "any",
    };
  }

  return {
    gameId: game.id,
    mode: "casual",
    desiredRoles: [],
    ownRoles: [],
    teammateRoles: [],
    microphonePreference: actor.match?.microphonePreference || "any",
    // Production normalization owns casual size defaults and bounds. Capacity
    // actors only contribute an explicit player preference when a scenario
    // needs one.
    ...(actor.match?.preferredTotalPlayers != null ? { preferredTotalPlayers: actor.match.preferredTotalPlayers } : {}),
  };
}

export async function loadCapacityGame(baseUrl, requestedGameId = "", fetchImpl = fetch) {
  const response = await fetchImpl(new URL("/api/config", baseUrl), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`CAPACITY_GAME: /api/config returned HTTP ${response.status}`);
  const config = await response.json();
  return selectCapacityGame(config?.games, requestedGameId);
}
