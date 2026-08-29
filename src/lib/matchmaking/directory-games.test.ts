import { describe, expect, it } from "vitest";
import { createGameRegistry } from "../games/registry";
import { deadlockGameDefinition } from "../games/deadlock";
import { matchmakingDirectoryGameIds } from "./directory-games";

describe("matchmaking directory game scope", () => {
  const comingSoon = {
    ...deadlockGameDefinition,
    id: "future-game",
    displayName: "Future Game",
    status: "coming_soon" as const,
  };
  const available = {
    ...deadlockGameDefinition,
    id: "fake-arena",
    displayName: "Fake Arena",
  };
  const registry = createGameRegistry([deadlockGameDefinition, available, comingSoon]);

  it("shows all available games when the viewer has no live ticket", () => {
    expect(matchmakingDirectoryGameIds(null, registry)).toEqual(["deadlock", "fake-arena"]);
  });

  it("scopes a live-ticket viewer to that available game", () => {
    expect(matchmakingDirectoryGameIds("fake-arena", registry)).toEqual(["fake-arena"]);
  });

  it("never scopes the public directory to a coming-soon game", () => {
    expect(matchmakingDirectoryGameIds("future-game", registry)).toEqual(["deadlock", "fake-arena"]);
  });
});
