import { describe, expect, it } from "vitest";
import { sessionPage } from "../public/js/pages/session-preview.js";

const self = { id: "a", nickname: "阿澈", username: "ache#1", avatarKey: "a", online: true };
const partner = { id: "b", nickname: "Borealis", username: "borealis#2", avatarKey: "b", online: true };
const exited = { id: "c", nickname: "已经离开的玩家", username: "gone#3", avatarKey: "c", online: false, memberStatus: "exited" };

function roomPage(room: Record<string, unknown>) {
  return sessionPage({
    authenticated: true,
    onboarded: true,
    user: self,
    need: {},
    room,
  });
}

describe("live Room projection", () => {
  it("does not render an exited member in the live Room roster", () => {
    const html = roomPage({
      id: "room-1",
      code: "ROOM-1",
      recruiting: true,
      need: { mode: "ranked", target: 2 },
      members: [self, partner, exited],
    });

    expect(html).toContain("Borealis");
    expect(html).not.toContain("已经离开的玩家");
  });

  it("shows only game, casual purpose, and microphone for a Casual Room", () => {
    const html = roomPage({
      id: "room-2",
      code: "ROOM-2",
      recruiting: true,
      formationGroupId: "group-2",
      need: { mode: "casual", target: 4 },
      members: [
        { ...self, need: { game: "deadlock", mode: "casual", goal: "娱乐", details: { rank: "oracle", role: "主核", voicePreference: "on" } } },
        { ...partner, need: { game: "deadlock", mode: "casual", goal: "娱乐", details: { rank: "archon", role: "辅助", voicePreference: "off" } } },
      ],
    });

    expect(html).toContain("休闲");
    expect(html).toContain("麦克风");
    expect(html).not.toContain("段位");
    expect(html).not.toContain("位置");
    expect(html).not.toContain("娱乐");
  });

  it("hides Stop Recruiting until another member has joined the Room shell", () => {
    const html = roomPage({
      id: "room-3",
      code: "ROOM-3",
      shell: true,
      recruiting: true,
      need: { mode: "casual", target: 4 },
      members: [self],
    });

    expect(html).toContain("加入中...");
    expect(html).not.toContain("停止招募");
  });
});
