import { deadlockGameDefinition } from "./deadlock";
import type { GameDefinition, GameRegistry } from "./types";

export function createGameRegistry(definitions: GameDefinition[]): GameRegistry {
  const byId = new Map<string, GameDefinition>();
  for (const definition of definitions) {
    if (!definition.id || byId.has(definition.id)) throw new Error(`GAME_DEFINITION_DUPLICATE:${definition.id}`);
    byId.set(definition.id, definition);
  }
  return {
    get(gameId) {
      return byId.get(gameId) || null;
    },
    require(gameId) {
      const definition = byId.get(gameId);
      if (!definition) throw new Error(`GAME_UNSUPPORTED:${gameId}`);
      return definition;
    },
    list() {
      return Array.from(byId.values());
    },
  };
}

export const gameRegistry = createGameRegistry([deadlockGameDefinition]);
