import { gameRegistry } from "../games/registry";
import type { GameRegistry } from "../games/types";

export function matchmakingDirectoryGameIds(ticketGameId: string | null | undefined, registry: GameRegistry = gameRegistry) {
  const availableGameIds = registry
    .list()
    .filter((game) => game.status === "available" && Object.values(game.modes).some((mode) => mode.enabled))
    .map((game) => game.id);
  return ticketGameId && availableGameIds.includes(ticketGameId) ? [ticketGameId] : availableGameIds;
}
