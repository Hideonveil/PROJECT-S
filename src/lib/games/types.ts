import type { MatchMode, MatchTicket, MatchmakingRuleSet } from "../matchmaking/types";

export type GameConfigurationStep = "rank" | "position" | "microphone" | "preferredTotalPlayers";

export type GameModeDefinition = {
  enabled: boolean;
  hardMaxPlayers: number;
  configurationSteps: GameConfigurationStep[];
};

export type PublicGameAsset = {
  src: string;
  width: number;
  height: number;
};

export type PublicGameRankOption = {
  code: string;
  value: string;
  name: string;
  subtitle: string;
  asset?: PublicGameAsset;
  artClass?: string;
};

export type PublicGamePositionOption = {
  code: number;
  label: string;
  roleLabel: string;
};

export type PublicGameDefinition = {
  id: string;
  displayName: string;
  status: "available" | "coming_soon" | "disabled";
  category: string;
  supportedClients: Array<"desktop" | "mobile">;
  icon: string;
  assets: {
    card?: PublicGameAsset;
    logo?: PublicGameAsset;
    modes?: Partial<Record<MatchMode, PublicGameAsset>>;
  };
  modes: Record<MatchMode, GameModeDefinition & { label: string }>;
  rankOptions: PublicGameRankOption[];
  positionOptions: PublicGamePositionOption[];
  roomCopy: {
    recruiting: string;
    locked: string;
  };
};

export type GameRuleAdapter = {
  normalizeRankCode(value: unknown): string | null;
  normalizePositions(values: unknown[]): number[];
  rankedHardFailures(a: MatchTicket, b: MatchTicket, rules: MatchmakingRuleSet): string[];
};

export type GameDefinition = {
  id: string;
  displayName: string;
  status: PublicGameDefinition["status"];
  category: string;
  supportedClients: PublicGameDefinition["supportedClients"];
  icon: string;
  assets: {
    card?: PublicGameAsset;
    logo?: PublicGameAsset;
    modes?: Partial<Record<MatchMode, PublicGameAsset>>;
  };
  modes: Record<MatchMode, GameModeDefinition & { label: string }>;
  rankOptions: PublicGameRankOption[];
  positionOptions: PublicGamePositionOption[];
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
