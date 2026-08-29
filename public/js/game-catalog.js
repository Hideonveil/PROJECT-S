let catalog = [];
let gamesById = new Map();

function normalizedGame(game) {
  if (!game || typeof game !== "object") return null;
  const id = String(game.id || "").trim();
  const displayName = String(game.displayName || "").trim();
  if (!id || !displayName) return null;
  return {
    ...game,
    id,
    displayName,
    supportedClients: Array.isArray(game.supportedClients) ? [...game.supportedClients] : [],
    rankOptions: Array.isArray(game.rankOptions) ? game.rankOptions.map((option) => ({ ...option })) : [],
    positionOptions: Array.isArray(game.positionOptions) ? game.positionOptions.map((option) => ({ ...option })) : [],
  };
}

export function installGameCatalog(games) {
  const next = [];
  const nextById = new Map();
  for (const candidate of Array.isArray(games) ? games : []) {
    const game = normalizedGame(candidate);
    if (!game || nextById.has(game.id)) continue;
    next.push(game);
    nextById.set(game.id, game);
  }
  catalog = next;
  gamesById = nextById;
  return listGames();
}

export function listGames() {
  return [...catalog];
}

export function availableGames(client = "desktop") {
  return catalog.filter((game) => (
    game.status === "available"
    && game.supportedClients.includes(client)
    && Object.values(game.modes || {}).some((mode) => mode?.enabled)
  ));
}

export function defaultAvailableGame(client = "desktop") {
  return availableGames(client)[0] || null;
}

export function gameById(gameId) {
  return gamesById.get(String(gameId || "")) || null;
}

export function gameName(gameId, fallback = "游戏") {
  return gameById(gameId)?.displayName || fallback;
}
