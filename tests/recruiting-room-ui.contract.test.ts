import { describe, expect, it } from "vitest";
import { sessionPage } from "../public/js/pages/session-preview.js";

function recruitingRoom(memberCount = 1, recruiting = true) {
  const members = Array.from({ length: memberCount }, (_, index) => ({
    id: `member-${index + 1}`,
    username: `player-${index + 1}`,
    nickname: index === 0 ? "林默" : `队友 ${index + 1}`,
    memberStatus: "active",
    online: true,
    need: {
      game: "deadlock",
      goal: "娱乐",
      voice: true,
      details: { role: index === 0 ? "主核" : "辅助", voicePreference: "on" },
    },
  }));
  return {
    authenticated: true,
    onboarded: true,
    user: members[0],
    need: members[0].need,
    match: { status: "active" },
    room: {
      id: "room-1",
      code: "ROOM-1",
      status: "open",
      recruiting,
      formationGroupId: "group-1",
      targetTotalPlayers: 6,
      members,
      goodbyeRequests: [],
    },
  };
}

describe("recruiting Room UI", () => {
  it("renders a stable solo recruiting layout without pair connectors or confirmation ticks", () => {
    const html = sessionPage(recruitingRoom());

    expect(html).toContain('data-room-recruitment-loop');
    expect(html).toContain('data-member-count="1"');
    expect(html).toContain("session-fit-table--solo");
    expect(html).toContain('<h1 id="session-title">招募中</h1>');
    expect(html).toContain("停止招募");
    expect(html).not.toContain("ROOM / LIVE");
    expect(html).not.toContain("还在摇人");
    expect(html).not.toContain("可以先聊天；停止招募");
    expect(html).not.toContain("session-fit-link");
    expect(html).not.toContain("session-preview-player__confirmed");
  });

  it("removes the searching loop once recruitment is locked", () => {
    const html = sessionPage(recruitingRoom(2, false));

    expect(html).not.toContain('data-room-recruitment-loop');
    expect(html).not.toContain('data-action="lock-forming-room"');
  });
});
