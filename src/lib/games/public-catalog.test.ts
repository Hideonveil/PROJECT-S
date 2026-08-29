import { describe, expect, it } from "vitest";
import { gameRegistry } from "./registry";
import { publicGameCatalog } from "./public-catalog";

describe("public game catalog", () => {
  it("publishes the browser-safe Deadlock product definition without matcher code", () => {
    const catalog = publicGameCatalog(gameRegistry);

    expect(catalog).toEqual([
      expect.objectContaining({
        id: "deadlock",
        displayName: "Deadlock",
        status: "available",
        category: "MOBA FPS",
        supportedClients: ["desktop"],
        modes: {
          ranked: expect.objectContaining({
            enabled: true,
            hardMaxPlayers: 2,
            configurationSteps: ["rank", "position", "microphone"],
          }),
          casual: expect.objectContaining({
            enabled: true,
            hardMaxPlayers: 6,
            configurationSteps: ["microphone", "preferredTotalPlayers"],
          }),
        },
      }),
    ]);
    expect(catalog[0]?.rankOptions).toHaveLength(11);
    expect(catalog[0]?.positionOptions).toHaveLength(6);
    expect(JSON.stringify(catalog)).not.toContain("rankedHardFailures");
    expect(JSON.stringify(catalog)).not.toContain("capacityScenarios");
  });
});
