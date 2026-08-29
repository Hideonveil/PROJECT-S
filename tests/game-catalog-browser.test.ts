import { beforeEach, describe, expect, it } from "vitest";
import {
  availableGames,
  gameById,
  gameName,
  installGameCatalog,
} from "../public/js/game-catalog.js";
import { buildGameMatchInput } from "../public/js/game-match-input.js";
import { homePage, homeWizardPathFor } from "../public/js/pages/home.js";
import { heroDirectoryPersonMarkup } from "../public/js/pages/landing.js";
import { matchingPage } from "../public/js/pages/matching.js";
import { mePage } from "../public/js/pages/me.js";
import { sessionPage } from "../public/js/pages/session-preview.js";

const fakeGame: Record<string, any> = {
  id: "fake-arena",
  displayName: "Fake Arena Catalog",
  status: "available",
  category: "MOBA FPS",
  supportedClients: ["desktop"],
  icon: "swords",
  assets: {},
  modes: {
    ranked: { label: "冲分", enabled: true, hardMaxPlayers: 2, configurationSteps: ["rank"] },
    casual: { label: "休闲", enabled: true, hardMaxPlayers: 6, configurationSteps: ["microphone"] },
  },
  rankOptions: [{ code: "bronze", value: "铜牌显示文案", name: "铜牌", subtitle: "测试段位" }],
  positionOptions: [{ code: 7, label: "先锋", roleLabel: "先锋" }],
  roomCopy: { recruiting: "等待玩家中", locked: "人齐了" },
};

describe("browser game catalog", () => {
  beforeEach(() => installGameCatalog([]));

  it("uses the installed server catalog as the only game lookup", () => {
    installGameCatalog([
      fakeGame,
      { ...fakeGame, id: "future", displayName: "Future Game", status: "coming_soon" },
    ]);

    expect(gameById("fake-arena")?.displayName).toBe("Fake Arena Catalog");
    expect(gameName("fake-arena")).toBe("Fake Arena Catalog");
    expect(gameName("unknown", "未知游戏")).toBe("未知游戏");
    expect(availableGames("desktop").map((game) => game.id)).toEqual(["fake-arena"]);
    expect(availableGames("mobile")).toEqual([]);
  });

  it("drives Home and Profile labels from the installed catalog", () => {
    installGameCatalog([fakeGame]);
    const user = {
      id: "viewer",
      nickname: "测试玩家",
      handle: "TEST#0001",
      avatarKey: "",
      online: true,
      games: [{ gameId: "fake-arena", rank: "bronze", role: "先锋" }],
    };
    const state = {
      authenticated: true,
      user,
      room: null,
      match: { directory: [], pool: 0 },
      recentConnections: [],
      stats: { sessions: 0, hours: 0 },
    };
    const filter = {
      game: "",
      goal: "",
      rank: "",
      step: 0,
      direction: 1,
      ownRoles: [],
      teammateRoles: [],
      preferredTotalPlayers: "",
      voice: "on",
    };

    expect(homePage(state, filter)).toContain("Fake Arena Catalog");
    expect(mePage(state)).toContain("Fake Arena Catalog");
    const rankedHtml = homePage(state, { ...filter, game: "fake-arena", goal: "rank", step: 1 });
    expect(rankedHtml).toContain('data-value="bronze"');
    expect(rankedHtml).not.toContain('data-value="铜牌显示文案"');
  });

  it("drives each mode's wizard path from the game definition", () => {
    installGameCatalog([fakeGame]);
    const filter = { game: "fake-arena", goal: "", step: 0 };
    expect(homeWizardPathFor(filter)).toEqual([{ key: "goal", label: "游戏目的" }]);
    expect(homeWizardPathFor({ ...filter, goal: "rank" }).map((step) => step.key)).toEqual(["goal", "rank"]);
    expect(homeWizardPathFor({ ...filter, goal: "casual" }).map((step) => step.key)).toEqual(["goal", "voice"]);
  });

  it("drives Matching and Room labels from the installed catalog", () => {
    installGameCatalog([fakeGame]);
    const user = { id: "viewer", nickname: "测试玩家", handle: "TEST#0001", online: true };
    const need = { game: "fake-arena", goal: "冲分", mode: "ranked", target: 2, voice: true, details: { rank: "bronze" } };
    const state = {
      authenticated: true,
      user,
      need,
      match: { status: "active", pool: 0, pair: null, candidate: null, group: null },
      room: {
        id: "room-1",
        code: "ROOM1",
        status: "open",
        recruiting: true,
        activeMemberCount: 1,
        members: [{ id: "viewer", userId: "viewer", nickname: "测试玩家", memberStatus: "active", need }],
        messages: [],
      },
      session: null,
    };

    expect(matchingPage({ ...state, room: null })).toContain("Fake Arena Catalog");
    expect(matchingPage({ ...state, room: null })).toContain("铜牌显示文案");
    expect(sessionPage(state)).toContain("Fake Arena Catalog");
    expect(sessionPage(state)).toContain("铜牌显示文案");
    expect(heroDirectoryPersonMarkup({ nickname: "目录玩家", gameId: "fake-arena", mode: "ranked", rankCode: "bronze", desiredRoles: [7] })).toContain("Fake Arena Catalog");
    expect(heroDirectoryPersonMarkup({ nickname: "目录玩家", gameId: "fake-arena", mode: "ranked", rankCode: "bronze", desiredRoles: [7] })).toContain("铜牌");
  });

  it("builds a new game's matchmaking payload from its catalog limits", () => {
    const fourPlayerGame = {
      ...fakeGame,
      modes: {
        ...fakeGame.modes,
        casual: { ...fakeGame.modes.casual, hardMaxPlayers: 4 },
      },
    };

    expect(buildGameMatchInput({
      game: fourPlayerGame,
      mode: "casual",
      ownRoles: [7, 99],
      microphonePreference: "on",
      preferredTotalPlayers: 9,
    })).toEqual(expect.objectContaining({
      gameId: "fake-arena",
      mode: "casual",
      ownRoles: [7],
      preferredTotalPlayers: 9,
    }));
  });
});
