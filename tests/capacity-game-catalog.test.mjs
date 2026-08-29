import { describe, expect, it } from "vitest";

import { buildCapacityMatchInput, selectCapacityGame } from "../tools/capacity/game-catalog.mjs";

const catalog = [
  {
    id: "fake-arena",
    displayName: "Fake Arena",
    status: "available",
    supportedClients: ["desktop"],
    modes: {
      ranked: { enabled: true, hardMaxPlayers: 2, configurationSteps: ["rank"] },
      casual: { enabled: true, hardMaxPlayers: 4, configurationSteps: ["preferredTotalPlayers"] },
    },
    rankOptions: [{ code: "bronze" }, { code: "silver" }],
    positionOptions: [{ code: 7 }],
  },
];

describe("capacity game catalog", () => {
  it("selects the available game from the public catalog", () => {
    expect(selectCapacityGame(catalog).id).toBe("fake-arena");
  });

  it("derives game, rank, roles, and casual size from the catalog", () => {
    expect(buildCapacityMatchInput({ role: "ranked", match: {} }, catalog[0])).toEqual({
    gameId: "fake-arena",
    mode: "ranked",
    rankCode: "bronze",
    desiredRoles: [7],
    ownRoles: [7],
    teammateRoles: [7],
    microphonePreference: "any",
  });
    expect(buildCapacityMatchInput({ role: "casual", match: {} }, catalog[0])).toEqual({
      gameId: "fake-arena",
      mode: "casual",
      desiredRoles: [],
      ownRoles: [],
      teammateRoles: [],
      microphonePreference: "any",
    });
  });
});
