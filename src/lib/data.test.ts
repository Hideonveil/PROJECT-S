import { describe, expect, it } from "vitest";
import { matchReasons, publicProfile, scoreMatch } from "./data";
import type { NeedInput, Profile } from "./types";

const profile = {
  id: "00000000-0000-0000-0000-000000001234",
  auth_user_id: "00000000-0000-0000-0000-000000005678",
  nickname: "测试玩家",
  avatar_key: "me-1",
  device: "PC",
  gender: "保密",
  play_style: "轻松",
  voice: true,
  online: true,
  last_seen: null,
  friend_code: "NODE-SECRET",
  genres: ["沙盒"],
  game_accounts: { minecraft: { id: "private-account" } },
  created_at: new Date(0).toISOString(),
} as Profile;

const need: NeedInput = {
  game: "minecraft",
  mode: "生存联机",
  goal: "开荒",
  current: 1,
  target: 2,
  time: "现在开始",
  duration: "90",
  voice: true,
  playerType: "轻松",
  details: {},
};

describe("public player DTO", () => {
  it("does not expose friend code or game account outside an authorized private view", () => {
    const safe = publicProfile(profile);
    expect(safe.friendCode).toBe("");
    expect(safe.gameAccounts).toEqual({});
  });

  it("can include private fields for the owner or an authorized room member", () => {
    const privateView = publicProfile(profile, [], { includePrivate: true });
    expect(privateView.friendCode).toBe("NODE-SECRET");
    expect(privateView.gameAccounts.minecraft.id).toBe("private-account");
  });

  it("shares a game account in a room without leaking the platform friend code", () => {
    const roomView = publicProfile(profile, [], { includeGameAccounts: true });
    expect(roomView.friendCode).toBe("");
    expect(roomView.gameAccounts.minecraft.id).toBe("private-account");
  });
});

describe("matching rules", () => {
  it("gives a full score and clear reasons to a fully compatible need", () => {
    expect(scoreMatch(need, need)).toBe(100);
    expect(matchReasons(need, need)).toContain("同一游戏");
  });
});
