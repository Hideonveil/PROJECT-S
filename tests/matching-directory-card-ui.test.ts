import { describe, expect, it } from "vitest";
import { homePage } from "../public/js/pages/home.js";

const filter = {
  game: "",
  goal: "",
  rank: "",
  step: 0,
  direction: 1,
  ownRoles: [],
  teammateRoles: [],
  time: "现在",
  team: "1",
  teamMin: "1",
  teamMax: "1",
  casualIntent: "default",
  advancedOpen: false,
  voice: "on",
};

function renderDirectory(directory: Array<Record<string, unknown>>, pool = 0) {
  return homePage({
    authenticated: true,
    user: { id: "viewer", nickname: "测试玩家", handle: "TEST#0001", avatarKey: "", online: true },
    room: null,
    match: { directory, pool },
  }, filter);
}

describe("matching activity signal card", () => {
  it("keeps the empty state inside the light industrial card instead of an empty black panel", () => {
    const html = renderDirectory([]);

    expect(html).toContain('class="match-directory match-directory--signal-card"');
    expect(html).not.toContain("data-directory-count");
    expect(html).not.toContain("人正在摇");
    expect(html).not.toContain("正在寻找合适的队友");
    expect(html).toContain("等待玩家中");
    expect(html).toContain('class="match-directory-caution"');
    expect(html).toContain("实时更新中");
  });

  it("keeps every active player in the compact detail list without a separate count panel", () => {
    const html = renderDirectory([
      { nickname: "长夜未央", gameId: "deadlock", mode: "ranked", rankCode: "oracle", desiredRoles: [1], microphonePreference: "on" },
      { nickname: "Nebula", gameId: "deadlock", mode: "casual", desiredRoles: [5], microphonePreference: "off" },
    ]);

    expect(html).not.toContain("data-directory-count");
    expect(html).toContain("长夜未央");
    expect(html).toContain("Nebula");
    expect(html).toContain('class="match-directory-player-mark"');
    expect(html).toContain('class="match-directory-livebar"');
  });

  it("does not surface aggregate or historical pool counts", () => {
    const html = renderDirectory([], 99);

    expect(html).not.toContain("data-directory-count");
    expect(html).not.toContain(">99<");
  });
});
