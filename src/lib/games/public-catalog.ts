import type { GameRegistry, PublicGameDefinition } from "./types";

export function publicGameCatalog(registry: GameRegistry): PublicGameDefinition[] {
  return registry.list().map((definition) => ({
    id: definition.id,
    displayName: definition.displayName,
    status: definition.status,
    category: definition.category,
    supportedClients: [...definition.supportedClients],
    icon: definition.icon,
    assets: {
      ...(definition.assets.card ? { card: { ...definition.assets.card } } : {}),
      ...(definition.assets.logo ? { logo: { ...definition.assets.logo } } : {}),
      ...(definition.assets.modes ? {
        modes: Object.fromEntries(
          Object.entries(definition.assets.modes).map(([mode, asset]) => [mode, asset ? { ...asset } : asset])
        ),
      } : {}),
    },
    modes: {
      ranked: { ...definition.modes.ranked, configurationSteps: [...definition.modes.ranked.configurationSteps] },
      casual: { ...definition.modes.casual, configurationSteps: [...definition.modes.casual.configurationSteps] },
    },
    rankOptions: definition.rankOptions.map((option) => ({
      ...option,
      ...(option.asset ? { asset: { ...option.asset } } : {}),
    })),
    positionOptions: definition.positionOptions.map((option) => ({ ...option })),
    roomCopy: { ...definition.roomCopy },
  }));
}
