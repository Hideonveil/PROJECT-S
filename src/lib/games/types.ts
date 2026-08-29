import type { MatchMode, MatchTicket, MatchmakingRuleSet } from "../matchmaking/types";

export type GameConfigurationStep = "rank" | "position" | "microphone" | "preferredTotalPlayers";

export type GameModeDefinition = {
  enabled: boolean;
  hardMaxPlayers: number;
  configurationSteps: GameConfigurationStep[];
};

export type GameRuleAdapter = {
  normalizeRankCode(value: unknown): string | null;
  normalizePositions(values: unknown[]): number[];
  rankedHardFailures(a: MatchTicket, b: MatchTicket, rules: MatchmakingRuleSet): string[];
};

export type GameDefinition = {
  id: string;
  displayName: string;
  assets: {
    card?: string;
    logo?: string;
  };
  modes: Record<MatchMode, GameModeDefinition>;
  vocabulary: {
    ranks: readonly string[];
    positions: readonly (string | number)[];
  };
  roomCopy: {
    recruiting: string;
    locked: string;
  };
  capacityScenarios: Array<{
    id: string;
    rankedShare: number;
    casualShare: number;
  }>;
  rules: GameRuleAdapter;
};

export type GameRegistry = {
  get(gameId: string): GameDefinition | null;
  require(gameId: string): GameDefinition;
  list(): GameDefinition[];
};
