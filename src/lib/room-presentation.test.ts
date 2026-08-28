import { describe, expect, it } from "vitest";
import { roleLabels, roomMemberNeed, roomRecruitmentPresentation, roomShellNeed } from "./room-presentation";

describe("Room presentation", () => {
  it("renders selected roles without replacing them with the generic fallback", () => {
    expect(roleLabels([1, 5])).toBe("主核 / 辅助");
    expect(roleLabels([])).toBe("位置不限");
  });

  it("builds the first Room shell from the current ticket conditions", () => {
    const need = roomShellNeed({
      game_id: "deadlock",
      mode: "ranked",
      rank_code: "emissary",
      desired_roles: [1],
      microphone_preference: "on",
      metadata: { ownRoles: [1], teammateRoles: [4] },
    }, {});

    expect(need).toMatchObject({
      goal: "冲分",
      target: 2,
      details: { rank: "emissary", role: "主核", teammateRole: "游走", voicePreference: "on" },
    });
  });

  it("keeps casual member conditions and current room size in the hydrated view", () => {
    const need = roomMemberNeed({
      game_id: "deadlock",
      mode: "casual",
      desired_roles: [],
      desired_teammates: 4,
      min_teammates: 1,
      microphone_preference: "off",
      metadata: {},
    }, { target: 5 }, 3);

    expect(need).toMatchObject({ goal: "休闲", target: 5, current: 3, voice: false });
  });

  it("derives recruitment UI from Room, Session and formation state", () => {
    expect(roomRecruitmentPresentation("connecting", null, "forming")).toEqual({
      recruiting: true,
      recruitmentState: "recruiting",
      isForming: true,
    });
    expect(roomRecruitmentPresentation("connecting", "ready", "forming")).toEqual({
      recruiting: false,
      recruitmentState: "locked",
      isForming: true,
    });
  });
});
