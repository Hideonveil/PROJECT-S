import { expect, test, type Page } from "@playwright/test";
import { gameRegistry } from "../../src/lib/games/registry";
import { publicGameCatalog } from "../../src/lib/games/public-catalog";

const mockGameCatalog = publicGameCatalog(gameRegistry);

function mockJwt(subject: string, email = `${subject}@project-s.local`) {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: subject,
    aud: "authenticated",
    role: "authenticated",
    email,
    exp: 4102444800,
  })}.test-signature`;
}

const mockAuthUserId = "00000000-0000-0000-0000-000000000001";
const mockAccessToken = mockJwt(mockAuthUserId, "test@project-s.local");
const mockProfile = {
  id: "00000000-0000-0000-0000-000000000111",
  nickname: "测试玩家",
  handle: "测试玩家#0111",
  avatarKey: "me-1",
  friendCode: "TEST-PLAYER-0111",
  device: "PC",
  gender: "保密",
  ageRange: "23-29",
  games: [],
  genres: ["FPS"],
  playStyle: "",
  voice: true,
  online: true,
  gameAccounts: {},
};

const mockRecentConnection = {
  player: {
    id: "00000000-0000-0000-0000-000000000222",
    nickname: "旧队友",
    handle: "旧队友#0222",
    avatarKey: "me-2",
    online: true,
  },
  gameId: "deadlock",
  playedAt: "2026-08-16T12:00:00.000Z",
  playCount: 3,
  rating: "happy",
  wantAgain: true,
};

const mockPartner = {
  id: "00000000-0000-0000-0000-000000000222",
  nickname: "连接玩家",
  handle: "连接玩家#0222",
  avatarKey: "me-2",
  device: "PC",
  playStyle: "稳健沟通",
  online: true,
  memberStatus: "active",
  exitedAt: null,
  gameAccounts: { deadlock: { steamFriendCode: "76561198000000222" } },
};

const mockActiveRoom = {
  id: "00000000-0000-0000-0000-000000000444",
  code: "LINK42",
  status: "playing",
  realtimeVersion: 2,
  resumeEligible: true,
  startedAt: "2026-08-19T00:00:00.000Z",
  need: { game: "deadlock", mode: "天梯上分", goal: "上分", voice: true, time: "现在", target: 2 },
  members: [
    { ...mockProfile, memberStatus: "active", exitedAt: null },
    mockPartner,
  ],
  goodbyeRequests: [],
};

const mockRecruitingRoom = {
  id: "00000000-0000-0000-0000-000000000445",
  code: "SHELL1",
  status: "connecting",
  realtimeVersion: 1,
  startedAt: "2026-08-19T00:00:00.000Z",
  need: { game: "deadlock", mode: "娱乐", goal: "娱乐", voice: true, time: "现在", target: 6 },
  members: [{ ...mockProfile, memberStatus: "active", exitedAt: null }],
  goodbyeRequests: [],
  recruitmentVotes: [],
  recruiting: true,
  recruitmentState: "recruiting",
  formationState: "forming",
  shell: true,
  resumeEligible: true,
};

async function mockProductBackend(
  page: Page,
  capture: { profile?: Record<string, unknown>; match?: Record<string, unknown>; friendAdd?: Record<string, unknown> } = {}
) {
  let profileExists = true;
  const matchStartedAt = new Date().toISOString();
  await page.route("**/api/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
  await page.route("**/api/pool-summary", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ online: 8, matching: 8, playing: 3 }),
    })
  );
  await page.route("**/api/public-directory", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ directory: [] }) })
  );
  await page.route("**/api/events", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ supabaseUrl: "https://supabase.test", supabaseAnonKey: "test-anon-key", games: mockGameCatalog }),
    })
  );
  await page.route("https://supabase.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: mockAccessToken,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: mockAuthUserId,
          email: "test@project-s.local",
          user_metadata: { username: "testplayer" },
        },
      }),
    })
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: "test@project-s.local",
        user_id: mockAuthUserId,
        session: {
          access_token: mockAccessToken,
          refresh_token: "test-refresh-token",
          expires_in: 3600,
          expires_at: 4102444800,
          token_type: "bearer",
        },
      }),
    })
  );
  await page.route("**/api/auth/register", (route) => {
    profileExists = false;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ email: "test@project-s.local" }),
    });
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, profile: profileExists ? mockProfile : null }),
    })
  );
  await page.route("**/api/register", (route) => {
    profileExists = true;
    capture.profile = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: mockProfile }),
    });
  });
  await page.route("**/api/state", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: mockProfile,
        friends: [],
        recentConnections: [mockRecentConnection],
        room: null,
        session: null,
        matching: 8,
        playing: 3,
        matchmaking: { ticket: null, pair: null, candidate: null, matching: 8, matchable: 8 },
      }),
    })
  );
  await page.route("**/api/matchmaking/start", (route) => {
    capture.match = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id, search_started_at: matchStartedAt },
        pair: null,
        candidate: null,
        room: mockRecruitingRoom,
        matching: 8,
        matchable: 8,
      }),
    });
  });
  await page.route("**/api/matchmaking/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id, search_started_at: matchStartedAt }, pair: null, candidate: null, room: mockRecruitingRoom, matching: 8, matchable: 8 }) })
  );
  await page.route("**/api/matchmaking/cancel", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: { state: "cancelled" } }) })
  );
  await page.route("**/api/friends/search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "00000000-0000-0000-0000-000000000333",
          nickname: "代码好友",
          avatarKey: "",
          online: true,
          device: "PC",
          friendCode: "NODE-ABCD-EFGH",
        },
      }),
    })
  );
  await page.route("**/api/friends/add", (route) => {
    capture.friendAdd = route.request().postDataJSON();
    const requestedUser = {
      id: "00000000-0000-0000-0000-000000000333",
      nickname: "代码好友",
      avatarKey: "",
      online: true,
      device: "PC",
      friendCode: "NODE-ABCD-EFGH",
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: requestedUser,
        status: "pending",
        friends: [],
        friendRequests: { incoming: [], outgoing: [{ user: requestedUser, createdAt: "2026-08-19T00:00:00.000Z" }] },
      }),
    });
  });
}

async function login(page: Page) {
  await page.locator(".product-auth-actions").getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#auth-identifier").fill("testplayer");
  await page.locator("#auth-password").fill("Phase1-test!");
  await page.locator(".product-auth-submit").click();
  await expect(page.locator(".product-topbar-user span")).toHaveText("测试玩家");
  await expect(page.locator(".product-topbar-user small")).toHaveText("测试玩家#0111");
}

async function reachDeadlockCasualFinal(page: Page) {
  await page.getByRole("button", { name: /Deadlock/ }).click();
  await page.getByRole("button", { name: "休闲", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "偏好房间总人数" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();
}

type RecoveryProfile = { id: string; nickname: string; [key: string]: unknown };

async function mockThreeMemberRecoveryBackend(
  page: Page,
  me: RecoveryProfile,
  members: RecoveryProfile[],
  capture: { offline: number },
) {
  const room = {
    ...mockActiveRoom,
    id: "00000000-0000-0000-0000-000000000777",
    code: "REFRESH3",
    need: { ...mockActiveRoom.need, mode: "娱乐", goal: "娱乐", target: 3 },
    members: members.map((member) => ({ ...member, memberStatus: "active", exitedAt: null })),
    goodbyeRequests: [],
  };
  const session = {
    id: "session-refresh-3",
    roomCode: room.code,
    status: "playing",
    players: members.map((member) => member.id),
    members: room.members,
    targetTotalPlayers: 3,
  };
  const stateSnapshot = () => ({
    user: me,
    friends: [],
    friendRequests: { incoming: [], outgoing: [] },
    recentConnections: [],
    room,
    session,
    matching: 0,
    playing: 3,
    matchmaking: { ticket: null, pair: null, group: null, candidate: null, matching: 0, matchable: 0 },
  });

  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, online: 3, matching: 0, playing: 3 }),
  }));
  await page.route("**/api/pool-summary", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ online: 3, matching: 0, playing: 3 }),
  }));
  await page.route("**/api/public-directory", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ directory: [] }),
  }));
  await page.route("**/api/events", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ supabaseUrl: "https://supabase.test", supabaseAnonKey: "test-anon-key", games: mockGameCatalog }),
  }));
  await page.route("https://supabase.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      access_token: mockJwt(`auth-${me.id}`, `${me.id}@project-s.local`),
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: `test-refresh-token-${me.id}`,
      user: { id: `auth-${me.id}`, email: `${me.id}@project-s.local`, user_metadata: { username: me.nickname } },
    }),
  }));
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      email: `${me.id}@project-s.local`,
      user_id: `auth-${me.id}`,
      session: {
        access_token: mockJwt(`auth-${me.id}`, `${me.id}@project-s.local`),
        refresh_token: `test-refresh-token-${me.id}`,
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: "bearer",
      },
    }),
  }));
  await page.route("**/api/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, profile: me }),
  }));
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(stateSnapshot()),
  }));
  await page.route("**/api/online", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/offline", (route) => {
    capture.offline += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

async function loginAs(page: Page, me: RecoveryProfile) {
  await page.locator(".product-auth-actions").getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#auth-identifier").fill(me.nickname);
  await page.locator("#auth-password").fill("Phase1-test!");
  await page.locator(".product-auth-submit").click();
  await expect(page.locator(".product-topbar-user span")).toHaveText(me.nickname);
}

async function resumeRoomFromHome(page: Page) {
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole("heading", { name: "检测到尚未结束的 Room", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "连接回房间", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
}

test("first-time visitors land on the hero and enter the matching workspace", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page).toHaveTitle(/机.{0,2}缘/);
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.locator(".product-rail")).toHaveCount(0);
  await expect(page.locator(".landing-brand")).toHaveAttribute("href", "#/hero");
  await expect(page.locator(".landing-auth").getByRole("button", { name: "登录", exact: true })).toBeVisible();
  await expect(page.locator(".landing-auth").getByRole("button", { name: "注册", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();
  await expect(page.locator("#landing-title")).toContainText("总有人想一起玩");
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
  expect(pageHeight).toBeGreaterThan(1.3);
  expect(pageHeight).toBeLessThan(1.8);
  const heroMatch = page.getByRole("button", { name: "开始匹配", exact: true });
  await expect.poll(() => heroMatch.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await heroMatch.hover();
  await expect.poll(() => heroMatch.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);
  const heroMatchBefore = await heroMatch.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(80);
  const heroMatchAfter = await heroMatch.boundingBox();
  // The current hero CTA is part of the document flow (the old fixed-card
  // contract was retired with the hero shell); verify it scrolls with the
  // page instead of asserting the removed layout.
  expect((heroMatchAfter?.y || 0) - (heroMatchBefore?.y || 0)).toBeLessThan(-100);
  await page.evaluate(() => window.scrollTo(0, 0));
  await heroMatch.click();
  await expect(page.locator("[data-project-transition]")).toBeVisible();
  await expect(page.locator(".product-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: /Deadlock/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "冲分", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "摇人", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "社区", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "我的", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deadlock/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toHaveCount(0);
  await expect(page.locator(".match-head p")).toHaveText("总有人想一起玩");
  await expect(page.locator("[data-ticker-head]")).toHaveCount(1);
  await expect(page.locator("[data-ticker-tail]")).toHaveCount(1);
  const tickerMetrics = await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>("[data-ticker-head]");
    const tail = document.querySelector<HTMLElement>("[data-ticker-tail]");
    const track = document.querySelector<HTMLElement>("[data-ticker-track]");
    return {
      head: head?.getBoundingClientRect().width || 0,
      tail: tail?.getBoundingClientRect().width || 0,
      track: track?.getBoundingClientRect().width || 0,
      viewport: window.innerWidth,
    };
  });
  expect(tickerMetrics.head).toBeGreaterThan(tickerMetrics.viewport);
  expect(Math.abs(tickerMetrics.head - tickerMetrics.tail)).toBeLessThan(1);
  expect(Math.abs(tickerMetrics.track - tickerMetrics.head * 2)).toBeLessThan(2);
  const tickerBefore = await page.locator("[data-ticker-track]").getAttribute("style");
  await page.waitForTimeout(180);
  const tickerAfter = await page.locator("[data-ticker-track]").getAttribute("style");
  expect(tickerAfter).not.toBe(tickerBefore);
});

test("game selection opens Deadlock steps and keeps other games coming soon", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/index.html#/home");

  await page.getByRole("button", { name: /Deadlock/ }).click();
  await expect(page.getByRole("button", { name: "冲分", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回游戏", exact: true }).click();
  await expect(page.locator(".match-games-soon")).toContainText("COMING SOON");
  await expect(page.getByRole("button", { name: /我的世界/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("matching contact opens the OPS inbox form and submits without a fullscreen transition", async ({ page }) => {
  await mockProductBackend(page);
  let feedback: Record<string, unknown> | null = null;
  await page.route("**/api/feedback", (route) => {
    feedback = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/index.html?contact=1#/home", { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: /联系我们/ }).click();
  await expect(page.locator(".contact-sheet")).toBeVisible();
  await expect(page.getByText("不是发邮件。", { exact: true })).toBeVisible();
  await page.locator("#feedback-message").fill("这是一次联系我们收件箱的自动化测试反馈");
  await page.locator("#feedback-contact").fill("test-contact");
  await page.getByRole("button", { name: "发送到运营台" }).click();
  await expect(page.locator("[data-project-transition]")).toHaveCount(0);
  await expect(page.getByText("已经送到运营台，我们会在这里处理。", { exact: true })).toBeVisible();
  expect(feedback).toMatchObject({ category: "bug", contact: "test-contact" });
  expect(feedback).not.toHaveProperty("currentPage");
  expect(feedback).not.toHaveProperty("currentGame");
});

test("Deadlock rank and casual paths expose different step systems", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/index.html#/home");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const nextButtonBox = await page.getByRole("button", { name: "下一步", exact: true }).boundingBox();
  expect((nextButtonBox?.y || 0) + (nextButtonBox?.height || 0)).toBeLessThanOrEqual(768);
  const stage = page.locator("[data-home-wizard-stage]");
  await stage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "冲分", exact: true }).click();
  await expect(stage).toHaveAttribute("data-test-persisted", "yes");
  const stepper = page.locator("[data-home-stepper]");
  await expect(stepper).toHaveAttribute("aria-label", "Deadlock 配置进度：第 1 步，共 4 步");
  await stepper.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(stepper).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.getByRole("button", { name: /新人/ })).toBeVisible();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("请选择当前段位", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /近卫/ }).click();
  await expect(page.getByRole("button", { name: /近卫/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  const ownRoles = page.getByRole("group", { name: "我的位置，可多选" });
  const teammateRoles = page.getByRole("group", { name: "希望队友位置，可多选" });
  await expect(ownRoles).toBeVisible();
  await expect(teammateRoles).toBeVisible();
  await expect(page.locator(".match-role-multi")).toHaveCount(2);
  await expect(ownRoles.getByRole("button", { name: /1号位/ }).locator(".match-role-number")).toContainText("1");
  await expect(ownRoles.getByRole("button", { name: /1号位/ }).locator(".match-role-label")).toHaveText("主核");
  await ownRoles.getByRole("button", { name: /2号位/ }).click();
  await teammateRoles.getByRole("button", { name: /3号位/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("冲分最好开麦哦", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回选择游戏", exact: true }).click();
  await expect(page.getByRole("button", { name: /Deadlock/ })).toBeVisible();
  await expect(page.locator(".match-games-soon")).toContainText("COMING SOON");

  await page.goto("/index.html?casual-path=1#/home");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const casualStage = page.locator("[data-home-wizard-stage]");
  await casualStage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "休闲", exact: true }).click();
  await expect(casualStage).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator("[data-home-stepper]")).toHaveAttribute("aria-label", "Deadlock 配置进度：第 1 步，共 2 步");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("group", { name: "偏好房间总人数" })).toBeVisible();
  await expect(page.getByRole("group", { name: /位置/ })).toHaveCount(0);
  await expect(page.getByText("冲分最好开麦哦", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "无所谓", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();
});

test("casual Room shows shared recruitment progress without an owner-only flow", async ({ page }) => {
  await mockProductBackend(page);
  const room = {
    ...mockRecruitingRoom,
    realtimeVersion: 2,
    shell: false,
    targetTotalPlayers: 3,
    need: { ...mockRecruitingRoom.need, target: 3 },
    members: [mockRecruitingRoom.members[0], mockPartner],
    recruitmentVoteCount: 0,
    recruitmentVoteTotal: 2,
  };
  await page.unroute("**/api/matchmaking/start");
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ticket: { id: "ticket-owner", state: "searching", room_id: room.id }, room, matching: 2, matchable: 2 }),
  }));
  await page.route("**/api/room/SHELL1/recruitment", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      room: { ...room, realtimeVersion: 3, recruitmentVotes: [{ userId: mockProfile.id }], recruitmentVoteCount: 1 },
      recruitment: { votes: 1, total: 2, locked: false },
    }),
  }));

  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  await expect(page.locator("[data-session-preview] .session-preview-player:not(.session-preview-player--joining)")).toHaveCount(2);
  await page.getByRole("button", { name: "停止招募", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止招募（1/2）", exact: true })).toBeVisible();
  await expect(page.getByText("已选择停止招募（1/2）", { exact: true })).toBeVisible();
});

test("a failed cancellation keeps the live matching state for reconciliation", async ({ page }) => {
  await mockProductBackend(page);
  let started = false;
  await page.unroute("**/api/matchmaking/start");
  await page.route("**/api/matchmaking/start", (route) => {
    started = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id },
        room: mockRecruitingRoom,
        matching: 1,
        matchable: 1,
      }),
    });
  });
  await page.unroute("**/api/matchmaking/cancel");
  await page.route("**/api/matchmaking/cancel", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "服务暂不可用" } }) })
  );
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      room: started ? mockRecruitingRoom : null,
      session: null,
      matching: started ? 1 : 0,
      playing: 0,
      matchmaking: { ticket: started ? { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id } : null, pair: null, group: null, candidate: null },
    }),
  }));
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  await page.getByRole("button", { name: "退出招募", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  await expect(page.getByText("服务暂不可用", { exact: true })).toBeVisible();
});

test("hero auth actions use a dedicated transition without affecting auth tabs", async ({ page }) => {
  await page.goto("/index.html#/hero");
  await page.locator(".landing-auth").getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("[data-project-transition]")).toBeVisible();
  await expect(page.locator("[data-project-transition]")).toHaveAttribute("aria-label", "正在进入账号页面");
  await expect(page).toHaveURL(/#\/auth$/);
  await expect(page.locator("[data-project-transition]")).toHaveCount(0);
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await expect(page.locator("[data-project-transition]")).toHaveCount(0);
});

test("navigation keeps icon-only rest state and staggers open on hover", async ({ page }) => {
  await page.goto("/index.html#/home");
  const rail = page.locator("[data-staggered-rail]");
  const signedOutIcon = rail.locator(".product-account-icon");
  await expect(rail.locator(".product-brand")).toHaveAttribute("href", "#/hero");
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
  const collapsedSignedOutIcon = await signedOutIcon.boundingBox();
  await rail.hover();
  await expect(rail).toHaveClass(/is-staggered-open/);
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await expect(page.locator(".product-nav-link > span").first()).toHaveCSS("opacity", "1");
  const expandedSignedOutIcon = await signedOutIcon.boundingBox();
  expect(expandedSignedOutIcon?.width).toBe(collapsedSignedOutIcon?.width);
  expect(expandedSignedOutIcon?.height).toBe(collapsedSignedOutIcon?.height);
  const railBox = await rail.boundingBox();
  const matchEyebrowBox = await page.locator(".match-head .match-eyebrow").boundingBox();
  expect((railBox?.x || 0) + (railBox?.width || 0)).toBeLessThanOrEqual(matchEyebrowBox?.x || 0);
  await rail.getByRole("link", { name: "社区", exact: true }).click();
  await expect(page).toHaveURL(/#\/community$/);
  await expect(rail).toHaveClass(/is-staggered-open.*is-route-held/);
  await expect(rail).toHaveCSS("transition-duration", "0s");
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await rail.evaluate((element) => {
    element.setAttribute("data-test-layer-replays", "0");
    const layers = [...element.querySelectorAll<HTMLElement>(".product-rail-layer")];
    const observer = new MutationObserver(() => {
      if (layers.some((layer) => layer.style.transform.includes("-112%"))) {
        const count = Number(element.getAttribute("data-test-layer-replays") || 0);
        element.setAttribute("data-test-layer-replays", String(count + 1));
      }
    });
    layers.forEach((layer) => observer.observe(layer, { attributes: true, attributeFilter: ["style"] }));
  });
  await rail.getByRole("link", { name: "我的", exact: true }).click();
  await expect(page).toHaveURL(/#\/auth$/);
  await expect(rail).toHaveClass(/is-staggered-open.*is-route-held/);
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await expect(rail).toHaveAttribute("data-test-layer-replays", "0");
  await rail.getByRole("link", { name: "摇人", exact: true }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(rail).toHaveClass(/is-staggered-open.*is-route-held/);
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await page.locator(".home-main").hover({ position: { x: 500, y: 220 } });
  await expect(rail).not.toHaveClass(/is-staggered-open/);
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
  const recollapsedSignedOutIcon = await signedOutIcon.boundingBox();
  expect(recollapsedSignedOutIcon?.width).toBe(collapsedSignedOutIcon?.width);
  expect(recollapsedSignedOutIcon?.height).toBe(collapsedSignedOutIcon?.height);

  await rail.hover();
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await page.locator(".home-main").hover({ position: { x: 500, y: 220 } });
  await page.waitForTimeout(50);
  await rail.evaluate((element) => {
    element.setAttribute("data-test-rapid-reentry-resets", "0");
    const layers = [...element.querySelectorAll<HTMLElement>(".product-rail-layer")];
    const observer = new MutationObserver((records) => {
      if (records.some((record) => (record.target as HTMLElement).style.transform.includes("-112%"))) {
        const count = Number(element.getAttribute("data-test-rapid-reentry-resets") || 0);
        element.setAttribute("data-test-rapid-reentry-resets", String(count + 1));
      }
    });
    layers.forEach((layer) => observer.observe(layer, { attributes: true, attributeFilter: ["style"] }));
  });
  const rapidRailBox = await rail.boundingBox();
  await page.mouse.move((rapidRailBox?.x || 0) + 24, (rapidRailBox?.y || 0) + 220);
  await page.waitForTimeout(120);
  await expect(rail).toHaveAttribute("data-test-rapid-reentry-resets", "0");
});

test("login and registration switch inside a stable account workspace", async ({ page }) => {
  await page.goto("/index.html#/auth");
  const ticker = page.locator("[data-ticker-track]");
  const rail = page.locator("[data-staggered-rail]");
  await ticker.evaluate((element) => { element.setAttribute("data-test-persisted", "yes"); });
  await rail.evaluate((element) => { element.setAttribute("data-test-persisted", "yes"); });

  const workspace = page.locator("[data-auth-workspace]");
  const before = await workspace.boundingBox();
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await expect(workspace).toHaveClass(/is-register/);
  await expect(page.locator("#auth-password-confirm")).toBeEnabled();
  await expect(ticker).toHaveAttribute("data-test-persisted", "yes");
  await expect(rail).toHaveAttribute("data-test-persisted", "yes");
  const afterRegister = await workspace.boundingBox();
  expect(Math.abs((afterRegister?.width || 0) - (before?.width || 0))).toBeLessThan(1);
  expect(Math.abs((afterRegister?.height || 0) - (before?.height || 0))).toBeLessThan(80);

  await page.getByRole("tab", { name: "登录", exact: true }).click();
  await expect(workspace).toHaveClass(/is-login/);
  await expect(page.locator("#auth-password-confirm")).toBeDisabled();
  await expect(ticker).toHaveAttribute("data-test-persisted", "yes");
  await expect(rail).toHaveAttribute("data-test-persisted", "yes");
  const afterLogin = await workspace.boundingBox();
  expect(afterLogin?.height).toBe(before?.height);
});

test("starting a match while signed out opens the account flow", async ({ page }) => {
  await page.goto("/index.html#/home");
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();

  await expect(page).toHaveURL(/#\/auth$/);
  await expect(page.getByRole("heading", { name: "回来继续摇人。" })).toBeVisible();
  await expect(page.getByText("登录后即可开始匹配。", { exact: true })).toBeVisible();
});

test("registration sends verification email before creating the player identity", async ({ page }) => {
  const capture: { profile?: Record<string, unknown> } = {};
  await mockProductBackend(page, capture);
  await page.goto("/index.html#/home");

  await page.locator(".product-auth-actions").getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.locator("[data-registration-stepper]")).toHaveCount(0);
  await page.locator("#auth-identifier").fill("testplayer");
  await page.locator("#auth-email").fill("testplayer@example.com");
  await page.locator("#auth-password").fill("Phase1-test!");
  const passwordEye = page.locator('[data-action="toggle-password"][data-target="auth-password"]');
  const eyeAlignment = await passwordEye.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const field = element.parentElement!.getBoundingClientRect();
    return Math.abs(button.top + button.height / 2 - (field.top + field.height / 2));
  });
  expect(eyeAlignment).toBeLessThan(1);
  await passwordEye.click();
  await expect(page.locator("#auth-password")).toHaveAttribute("type", "text");
  await expect(passwordEye).toHaveAttribute("aria-label", "隐藏密码");
  await passwordEye.click();
  await expect(page.locator("#auth-password")).toHaveAttribute("type", "password");
  await page.locator("#auth-password-confirm").fill("not-the-same");
  await page.locator('[data-action="toggle-password"][data-target="auth-password-confirm"]').click();
  await expect(page.locator("#auth-password-confirm")).toHaveAttribute("type", "text");
  await page.locator(".product-auth-submit").click();
  await expect(page.getByText("两次输入的密码不一致", { exact: true })).toBeVisible();
  await page.locator("#auth-password-confirm").fill("Phase1-test!");
  await page.locator(".product-auth-submit").click();

  await expect(page).toHaveURL(/#\/auth$/);
  await expect(page.getByRole("heading", { name: "再确认一下邮箱。", exact: true })).toBeVisible();
  await expect(page.getByText(/验证码已发送至/)).toBeVisible();
  await expect(page.getByText("testplayer@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "邮箱验证码", exact: true })).toBeVisible();
  expect(capture.profile).toBeUndefined();
});

test("desktop match controls use target cursor but the primary action does not", async ({ page }) => {
  await page.goto("/index.html#/home");
  const game = page.getByRole("button", { name: /Deadlock/ });
  await game.hover();
  await expect(page.locator(".target-cursor")).toHaveClass(/is-visible/);
  await expect(page.locator(".target-cursor")).toHaveClass(/is-locked/);

  await game.click();
  await page.getByRole("button", { name: "下一步", exact: true }).hover();
  await expect(page.locator(".target-cursor")).not.toHaveClass(/is-visible/);

  await page.getByRole("button", { name: "休闲", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "开始匹配", exact: true }).hover();
  await expect(page.locator(".target-cursor")).not.toHaveClass(/is-visible/);
});

test("authenticated matching uses a visual handoff and enters the Room shell", async ({ page }) => {
  await mockProductBackend(page);
  await page.unroute("**/api/matchmaking/start");
  await page.route("**/api/matchmaking/start", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id }, room: mockRecruitingRoom, matching: 8, matchable: 8 }),
    });
  });
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  const transition = page.locator("[data-project-transition]");
  await expect(transition).toBeVisible();
  await expect(transition).toHaveAttribute("aria-label", "正在进入招募");
  await expect(transition.locator(".project-transition-device")).toHaveCount(6);
  await expect(transition.locator(".project-transition-device small, .project-transition-center p")).toHaveCount(0);
  await expect(transition.locator(".project-transition-tape-track")).toHaveCount(2);
  const bottomTape = await transition.locator(".project-transition-tape--bottom").boundingBox();
  expect(bottomTape).not.toBeNull();
  expect((bottomTape?.y || 0) + (bottomTape?.height || 0)).toBeLessThanOrEqual(720);
  const tapeBefore = await transition.locator(".project-transition-tape-track").first().evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(180);
  const tapeAfter = await transition.locator(".project-transition-tape-track").first().evaluate((element) => getComputedStyle(element).transform);
  expect(tapeAfter).not.toBe(tapeBefore);
  await expect(page).toHaveURL(/#\/room$/);
  await expect(transition).toHaveCount(0);
  await expect(page.locator("[data-session-preview]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "招募中", exact: true })).toBeVisible();
  await expect(page.getByText("加入中...", { exact: true })).toBeVisible();
  await expect(page.locator("[data-matching-modal]")).toHaveCount(0);
});

test("a Room shell receives a new member through authoritative hydration without rerendering", async ({ page }) => {
  await mockProductBackend(page);
  let started = false;
  let joined = false;
  let sharedRoomHistoryReads = 0;
  const sharedRoom = { ...mockRecruitingRoom, id: "shared-room", code: "SHAREDROOM" };
  const sharedRoomMessages = [
    { id: "message-chat", room_id: sharedRoom.id, sender_id: mockPartner.id, content: "队友消息", kind: "chat", created_at: "2026-08-29T01:00:00.000Z" },
    { id: "message-stop", room_id: sharedRoom.id, sender_id: mockPartner.id, content: "停止招募", kind: "recruitment_vote", created_at: "2026-08-29T01:00:01.000Z" },
    { id: "message-goodbye", room_id: sharedRoom.id, sender_id: mockPartner.id, content: "拜拜", kind: "goodbye", created_at: "2026-08-29T01:00:02.000Z" },
  ];
  await page.unroute("**/api/matchmaking/start");
  await page.unroute("**/api/state");
  await page.route("**/api/room/SHELL1/messages", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ messages: [] }),
  }));
  await page.route("**/api/room/SHAREDROOM/messages", (route) => {
    sharedRoomHistoryReads += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: sharedRoomMessages }),
    });
  });
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify((started = true, { ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id }, room: mockRecruitingRoom, matching: 1, matchable: 1 })),
  }));
  await page.route("**/api/state", (route) => {
    const room = !started ? null : joined
      ? { ...sharedRoom, realtimeVersion: 2, shell: false, members: [mockRecruitingRoom.members[0], mockPartner] }
      : mockRecruitingRoom;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: mockProfile, room, session: null, matching: 1, playing: 0, matchmaking: { ticket: started ? { id: "ticket-1", state: "searching", room_id: joined ? sharedRoom.id : mockRecruitingRoom.id } : null, pair: null, group: null, candidate: null } }),
    });
  });
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  const roomRoot = page.locator("[data-session-preview]");
  await roomRoot.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  joined = true;
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.getByText("连接玩家", { exact: true })).toBeVisible();
  await expect(roomRoot).toHaveAttribute("data-test-persisted", "yes");
  await expect(roomRoot.locator(".session-preview-player:not(.session-preview-player--joining)")).toHaveCount(2);
  await expect.poll(() => sharedRoomHistoryReads).toBeGreaterThan(0);
  const chatLog = page.getByRole("log", { name: "聊天记录" });
  await expect(chatLog).toContainText("队友消息");
  await expect(chatLog).toContainText("停止招募");
  await expect(chatLog).toContainText("拜拜");
});

test("leaving a recruiting Room stays on Home when an old completed Session arrives late", async ({ page }) => {
  await mockProductBackend(page);
  let started = false;
  let left = false;
  const historicalSession = {
    id: "historical-session",
    roomId: "historical-room",
    roomCode: "HISTORY1",
    status: "completed",
    players: [mockProfile.id, mockPartner.id],
  };
  await page.unroute("**/api/matchmaking/start");
  await page.unroute("**/api/matchmaking/cancel");
  await page.unroute("**/api/state");
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify((started = true, {
      ticket: { id: "ticket-exit", state: "searching", room_id: mockRecruitingRoom.id },
      room: mockRecruitingRoom,
      matching: 1,
      matchable: 1,
    })),
  }));
  await page.route("**/api/matchmaking/cancel", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify((left = true, { ticket: { id: "ticket-exit", state: "cancelled" } })),
  }));
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      room: started && !left ? mockRecruitingRoom : null,
      session: left ? historicalSession : null,
      matching: started && !left ? 1 : 0,
      playing: 0,
      matchmaking: {
        ticket: started && !left ? { id: "ticket-exit", state: "searching", room_id: mockRecruitingRoom.id } : null,
        pair: null,
        group: null,
        candidate: null,
      },
    }),
  }));

  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  await page.getByRole("button", { name: "退出招募", exact: true }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(700);
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator("[data-gameover-root]")).toHaveCount(0);
});

test("a late snapshot for another Room cannot replace the current Room", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  const roomRoot = page.locator("[data-session-preview]");
  await roomRoot.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      room: { ...mockRecruitingRoom, id: "old-room", code: "OLDROOM", realtimeVersion: 99, members: [mockRecruitingRoom.members[0], mockPartner] },
      session: null,
      matching: 1,
      playing: 0,
      matchmaking: { ticket: { id: "old-ticket", state: "searching", room_id: "old-room" }, pair: null, group: null, candidate: null },
    }),
  }));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page).toHaveURL(/#\/room$/);
  await expect(roomRoot).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.getByText("连接玩家", { exact: true })).toHaveCount(0);
});

test("slow Room hydration preserves the shell and patches details in place", async ({ page }) => {
  await mockProductBackend(page);
  let started = false;
  await page.unroute("**/api/matchmaking/start");
  await page.unroute("**/api/state");
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify((started = true, { ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id }, room: mockRecruitingRoom, matching: 1, matchable: 1 })),
  }));
  await page.route("**/api/state", async (route) => {
    if (!started) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: mockProfile, room: null, session: null, matchmaking: { ticket: null } }) });
    await new Promise((resolve) => setTimeout(resolve, 900));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: mockProfile, room: { ...mockRecruitingRoom, realtimeVersion: 2, shell: false, members: [mockRecruitingRoom.members[0], mockPartner] }, session: null, matchmaking: { ticket: { id: "ticket-1", state: "searching", room_id: mockRecruitingRoom.id } } }),
    });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  await expect(page).toHaveURL(/#\/room$/);
  const roomRoot = page.locator("[data-session-preview]");
  await roomRoot.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await expect(page.getByLabel("聊天记录加载中")).toBeVisible();
  await expect(page.getByText("连接玩家", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(roomRoot).toHaveAttribute("data-test-persisted", "yes");
});

test("an active room asks before resuming and goodbye patches the existing Room", async ({ page }) => {
  await mockProductBackend(page);
  let goodbyeRequested = false;
  let goodbyeCalls = 0;
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      friendRequests: { incoming: [{ user: mockPartner, createdAt: "2026-08-19T00:01:00.000Z" }], outgoing: [] },
      recentConnections: [],
      room: { ...mockActiveRoom, goodbyeRequests: goodbyeRequested ? [{ userId: mockProfile.id, requestedAt: "2026-08-19T00:02:00.000Z" }] : [] },
      session: { id: "session-1", roomCode: "LINK42", status: "playing" },
      matching: 1,
      playing: 2,
      matchmaking: { ticket: null, pair: null, candidate: null, matching: 1, matchable: 1 },
    }),
  }));
  await page.route("**/api/room/LINK42/goodbye", async (route) => {
    goodbyeCalls += 1;
    goodbyeRequested = Boolean((await route.request().postDataJSON()).requested);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        room: { ...mockActiveRoom, goodbyeRequests: goodbyeRequested ? [{ userId: mockProfile.id, requestedAt: "2026-08-19T00:02:00.000Z" }] : [] },
        session: { id: "session-1", roomCode: "LINK42", status: "playing" },
      }),
    });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await resumeRoomFromHome(page);
  const room = page.locator("[data-session-preview]");
  await expect(room).toBeVisible();
  await expect(page.getByRole("region", { name: "Room 聊天", exact: true })).toBeVisible();
  await room.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "拜拜", exact: true }).click();
  await expect(page.getByRole("heading", { name: "确定要拜拜吗？", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^拜拜（1\/2）/ })).toBeVisible();
  await expect(page.getByText("1/2 已确认，等待其余 1 位成员。", { exact: true })).toBeVisible();
  await expect(room).toHaveAttribute("data-test-persisted", "yes");
  expect(goodbyeCalls).toBe(1);
  await page.getByRole("button", { name: /^拜拜（1\/2）/ }).click();
  await expect(page.getByRole("button", { name: "拜拜", exact: true })).toBeVisible();
  expect(goodbyeCalls).toBe(2);
  await expect(room).toHaveAttribute("data-test-persisted", "yes");
});

test("a three-member room restores every member and uses a 1/3 goodbye state", async ({ page }) => {
  await mockProductBackend(page);
  let goodbyeRequested = false;
  const memberC = {
    id: "00000000-0000-0000-0000-000000000555",
    nickname: "第三位玩家",
    handle: "第三位玩家#0555",
    avatarKey: "me-3",
    device: "PC",
    playStyle: "愿意沟通",
    online: true,
    memberStatus: "active",
    exitedAt: null,
    gameAccounts: { deadlock: { steamFriendCode: "76561198000000555" } },
  };
  const groupRoom = {
    ...mockActiveRoom,
    code: "GROUP3",
    need: { ...mockActiveRoom.need, target: 3, mode: "娱乐", goal: "娱乐" },
    members: [mockProfile, mockPartner, memberC].map((member) => ({ ...member, memberStatus: "active", exitedAt: null })),
    goodbyeRequests: [],
  };
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      friendRequests: { incoming: [], outgoing: [] },
      recentConnections: [],
      room: { ...groupRoom, goodbyeRequests: goodbyeRequested ? [{ userId: mockProfile.id, requestedAt: "2026-08-19T00:03:00.000Z" }] : [] },
      session: { id: "session-group-3", roomCode: "GROUP3", status: "playing", players: [mockProfile.id, mockPartner.id, memberC.id] },
      matching: 0,
      playing: 3,
      matchmaking: { ticket: null, pair: null, candidate: null, group: null, matching: 0, matchable: 0 },
    }),
  }));
  await page.route("**/api/room/GROUP3/goodbye", (route) => {
    goodbyeRequested = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        room: { ...groupRoom, goodbyeRequests: [{ userId: mockProfile.id, requestedAt: "2026-08-19T00:03:00.000Z" }] },
        session: { id: "session-group-3", roomCode: "GROUP3", status: "playing", players: [mockProfile.id, mockPartner.id, memberC.id] },
      }),
    });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await resumeRoomFromHome(page);
  await expect(page.getByText("连接玩家", { exact: true })).toBeVisible();
  await expect(page.getByText("第三位玩家", { exact: true })).toBeVisible();
  await expect(page.getByText("0/3 已确认，所有成员都确认后进入赛后反馈。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "拜拜", exact: true }).click();
  await expect(page.getByRole("heading", { name: "确定要拜拜吗？", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^拜拜（1\/3）/ })).toBeVisible();
  await expect(page.getByText("1/3 已确认，等待其余 2 位成员。", { exact: true })).toBeVisible();
  await expect(page.locator("[data-session-preview] .session-preview-player:not(.session-preview-player--joining)")).toHaveCount(3);
});

test("server-backed Goodbye count survives refresh at 1/3 and 2/3", async ({ page }) => {
  await mockProductBackend(page);
  const memberC = {
    id: "00000000-0000-0000-0000-000000000555",
    nickname: "第三位玩家",
    handle: "第三位玩家#0555",
    avatarKey: "me-3",
    device: "PC",
    playStyle: "愿意沟通",
    online: true,
    memberStatus: "active",
    exitedAt: null,
    gameAccounts: { deadlock: { steamFriendCode: "76561198000000555" } },
  };
  const groupRoom = {
    ...mockActiveRoom,
    code: "GROUP3-REFRESH",
    need: { ...mockActiveRoom.need, target: 3, mode: "娱乐", goal: "娱乐" },
    members: [mockProfile, mockPartner, memberC].map((member) => ({ ...member, memberStatus: "active", exitedAt: null })),
  };
  const goodbyeIds: string[] = [];
  const goodbyeRequests = () => goodbyeIds.map((userId) => ({ userId, requestedAt: "2026-08-19T00:04:00.000Z" }));
  const snapshot = () => ({
    user: mockProfile,
    friends: [],
    friendRequests: { incoming: [], outgoing: [] },
    recentConnections: [],
    room: { ...groupRoom, goodbyeRequests: goodbyeRequests() },
    session: { id: "session-group-3-refresh", roomCode: groupRoom.code, status: "playing", players: groupRoom.members.map((member) => member.id) },
    matching: 0,
    playing: 3,
    matchmaking: { ticket: null, pair: null, candidate: null, group: null, matching: 0, matchable: 0 },
  });
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(snapshot()),
  }));
  await page.route("**/api/room/GROUP3-REFRESH/goodbye", async (route) => {
    const body = await route.request().postDataJSON();
    if (body.requested && !goodbyeIds.includes(mockProfile.id)) goodbyeIds.push(mockProfile.id);
    if (!body.requested) goodbyeIds.splice(goodbyeIds.indexOf(mockProfile.id), 1);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ room: { ...groupRoom, goodbyeRequests: goodbyeRequests() }, session: snapshot().session }),
    });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await resumeRoomFromHome(page);
  await page.getByRole("button", { name: "拜拜", exact: true }).click();
  await expect(page.getByRole("button", { name: /^拜拜（1\/3）/ })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#\/room$/);
  await expect(page.getByRole("button", { name: /^拜拜（1\/3）/ })).toBeVisible();

  goodbyeIds.push(memberC.id);
  await page.reload();
  await expect(page).toHaveURL(/#\/room$/);
  await expect(page.getByRole("button", { name: /^拜拜（2\/3）/ })).toBeVisible();
  await expect(page.getByText("2/3 已确认，所有成员都确认后进入赛后反馈。", { exact: true })).toBeVisible();
});

test("three-member fit table aligns names and restores match links", async ({ page }) => {
  await mockProductBackend(page);
  const memberC = {
    id: "00000000-0000-0000-0000-000000000555",
    nickname: "第三位玩家",
    handle: "第三位玩家#0555",
    avatarKey: "me-3",
    device: "PC",
    playStyle: "愿意沟通",
    online: true,
    memberStatus: "active",
    exitedAt: null,
    gameAccounts: {},
  };
  const groupRoom = {
    ...mockActiveRoom,
    code: "FIT3",
    need: { ...mockActiveRoom.need, target: 3, mode: "娱乐", goal: "娱乐" },
    members: [mockProfile, mockPartner, memberC].map((member) => ({ ...member, memberStatus: "active", exitedAt: null })),
    goodbyeRequests: [],
  };
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      friendRequests: { incoming: [], outgoing: [] },
      recentConnections: [],
      room: groupRoom,
      session: { id: "session-fit-3", roomCode: "FIT3", status: "playing", players: groupRoom.members.map((member) => member.id) },
      matching: 0,
      playing: 3,
      matchmaking: { ticket: null, pair: null, candidate: null, group: null, matching: 0, matchable: 0 },
    }),
  }));

  await page.goto("/index.html#/home");
  await login(page);
  await resumeRoomFromHome(page);
  await expect(page.locator("[data-session-preview]")).toBeVisible();
  await expect(page.locator(".session-fit-row--head .session-fit-conditions--group > b")).toHaveCount(3);
  await expect(page.locator(".session-fit-row--head .session-fit-link--empty")).toHaveCount(2);
  await expect(page.locator(".session-fit-row--head .session-fit-line")).toHaveCount(0);
  await expect(page.locator(".session-fit-row--head .icon")).toHaveCount(0);
  await expect(page.locator(".session-fit-row--group:not(.session-fit-row--head)")).toHaveCount(3);
  await expect(page.locator(".session-fit-row--group:not(.session-fit-row--head) .session-fit-link.is-match")).toHaveCount(6);
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const geometry = await page.locator(".session-fit-row--group:not(.session-fit-row--head)").first().evaluate((row) => {
    const members = [...row.querySelectorAll(".session-fit-member")];
    const links = [...row.querySelectorAll(".session-fit-link")];
    const textRect = (node: Element) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, center: rect.left + rect.width / 2 };
    };
    return {
      members: members.length,
      links: links.map((link, index) => {
        const linkRect = link.getBoundingClientRect();
        const lineRect = link.querySelector(".session-fit-line")?.getBoundingClientRect();
        const previousText = textRect(members[index]);
        const nextText = textRect(members[index + 1]);
        const gapCenter = (previousText.right + nextText.left) / 2;
        const gapWidth = nextText.left - previousText.right;
        return {
          center: lineRect ? lineRect.left + lineRect.width / 2 : 0,
          gapCenter,
          left: lineRect?.left || 0,
          right: lineRect?.right || 0,
          leftTextRight: previousText.right,
          rightTextLeft: nextText.left,
          gapWidth,
          lineWidth: lineRect?.width || 0,
          linkLeft: linkRect.left,
          linkWidth: linkRect.width,
        };
      }),
    };
  });
  expect(geometry.members).toBe(3);
  expect(geometry.links).toHaveLength(2);
  geometry.links.forEach((link) => {
    expect(link.left).toBeGreaterThanOrEqual(link.leftTextRight + 12 - 0.5);
    expect(link.right).toBeLessThanOrEqual(link.rightTextLeft - 12 + 0.5);
    expect(Math.abs(link.center - link.gapCenter)).toBeLessThanOrEqual(4);
    expect(link.lineWidth).toBeGreaterThanOrEqual(link.gapWidth * 0.8);
  });

  const alignment = await page.locator(".session-fit-table").evaluate((table) => {
    const lefts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((node) => Math.round(node.getBoundingClientRect().left));
    const firstRow = table.querySelector(".session-fit-row--group:not(.session-fit-row--head)");
    return {
      header: lefts(table, ".session-fit-row--head b"),
      firstRow: firstRow ? lefts(firstRow, "strong") : [],
    };
  });
  expect(alignment.firstRow).toEqual(alignment.header);
});

test("two-member fit links keep real geometry at all required desktop viewports", async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/index.html#/session-preview");
    await expect(page.locator("[data-session-preview]")).toBeVisible();
    await expect(page.locator(".session-fit-row--head .session-fit-link--empty")).toHaveCount(1);
    await expect(page.locator(".session-fit-row--head .session-fit-line")).toHaveCount(0);
    await expect(page.locator(".session-fit-row--head .icon")).toHaveCount(0);
    await expect(page.locator("#room-chat")).toHaveAttribute("role", "log");
    await expect(page.locator("#chat-input")).toHaveAttribute("name", "message");
    await expect(page.locator("[data-session-live-announcer]")).toHaveAttribute("aria-live", "polite");
    await page.evaluate(() => document.fonts?.ready);
    const geometry = await page.locator(".session-fit-row:not(.session-fit-row--head)").first().evaluate((row) => {
      const members = [...row.querySelectorAll(".session-fit-member")];
      const line = row.querySelector(".session-fit-line");
      const lineRect = line?.getBoundingClientRect();
      const textRect = (node: Element) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      };
      const firstText = textRect(members[0]);
      const secondText = textRect(members[1]);
      const gapCenter = (firstText.right + secondText.left) / 2;
      const gapWidth = secondText.left - firstText.right;
      return {
        members: members.length,
        links: row.querySelectorAll(".session-fit-link").length,
        left: lineRect?.left || 0,
        right: lineRect?.right || 0,
        center: lineRect ? lineRect.left + lineRect.width / 2 : 0,
        gapCenter,
        leftTextRight: firstText.right,
        rightTextLeft: secondText.left,
        gapWidth,
        lineWidth: lineRect?.width || 0,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    expect(geometry.members).toBe(2);
    expect(geometry.links).toBe(1);
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.leftTextRight + 12 - 0.5);
    expect(geometry.right).toBeLessThanOrEqual(geometry.rightTextLeft - 12 + 0.5);
    expect(Math.abs(geometry.center - geometry.gapCenter)).toBeLessThanOrEqual(4);
    expect(geometry.lineWidth).toBeGreaterThanOrEqual(geometry.gapWidth * 0.8);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  }
});

test("Room chat scrolls inside its own panel instead of growing the whole Room", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html#/session-preview");
  await expect(page.locator("[data-session-preview]")).toBeVisible();
  await page.locator(".matching-session-modal").evaluate(async (modal) => {
    await Promise.all(modal.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });

  const roomHeightBefore = await page.locator("[data-session-preview]").evaluate((room) => room.getBoundingClientRect().height);
  const chatPanelHeightBefore = await page.locator(".session-preview-chat").evaluate((panel) => panel.getBoundingClientRect().height);
  const chatHeightBefore = await page.locator("#room-chat").evaluate((chat) => chat.getBoundingClientRect().height);
  const pageHeightBefore = await page.evaluate(() => document.documentElement.scrollHeight);

  const metrics = await page.locator("#room-chat").evaluate((chat) => {
    chat.insertAdjacentHTML("beforeend", Array.from({ length: 40 }, (_, index) => (
      `<div class="session-preview-message"><span>玩家 B</span><p>第 ${index + 1} 条测试消息</p><time>现在</time></div>`
    )).join(""));
    const style = getComputedStyle(chat);
    const chatPanel = chat.closest(".session-preview-chat");
    return {
      overflowY: style.overflowY,
      clientHeight: chat.clientHeight,
      scrollHeight: chat.scrollHeight,
      chatHeight: chat.getBoundingClientRect().height,
      chatPanelHeight: chatPanel?.getBoundingClientRect().height || 0,
      chatPanelOverflow: chatPanel ? getComputedStyle(chatPanel).overflow : "",
      roomHeight: document.querySelector("[data-session-preview]")?.getBoundingClientRect().height || 0,
      pageHeight: document.documentElement.scrollHeight,
    };
  });

  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.clientHeight).toBeLessThanOrEqual(321);
  expect(Math.abs(metrics.chatHeight - chatHeightBefore)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.chatPanelHeight - chatPanelHeightBefore)).toBeLessThanOrEqual(1);
  expect(metrics.chatPanelOverflow).toBe("hidden");
  expect(Math.abs(metrics.roomHeight - roomHeightBefore)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.pageHeight - pageHeightBefore)).toBeLessThanOrEqual(1);
  await expect(page.locator("#chat-input")).toBeVisible();
});

test("three independent clients keep the same active Session across refresh and return", async ({ browser }) => {
  test.setTimeout(120_000);
  const sharedProfileFields = {
    friendCode: "TEST-RECOVERY",
    gender: "保密",
    ageRange: "23-29",
    games: [],
    genres: ["FPS"],
    voice: true,
  };
  const members = [
    { ...mockProfile, id: "00000000-0000-0000-0000-000000000111", nickname: "玩家 A", handle: "玩家 A#0111" },
    { ...mockPartner, ...sharedProfileFields, id: "00000000-0000-0000-0000-000000000222", nickname: "玩家 B", handle: "玩家 B#0222" },
    { ...mockPartner, ...sharedProfileFields, id: "00000000-0000-0000-0000-000000000555", nickname: "玩家 C", handle: "玩家 C#0555" },
  ];
  const contexts = await Promise.all(members.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const captures = members.map(() => ({ offline: 0 }));
  const sharedMessages: Record<string, unknown>[] = [];
  let explicitExitCalls = 0;
  try {
    await Promise.all(pages.map((page, index) => mockThreeMemberRecoveryBackend(page, members[index], members, captures[index])));
    await Promise.all(pages.map((page, index) => page.route("**/api/room/REFRESH3/messages", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: sharedMessages }) });
      }
      const body = route.request().postDataJSON() as { content: string; operationId: string };
      const message = {
        id: `message-${sharedMessages.length + 1}`,
        room_id: "00000000-0000-0000-0000-000000000777",
        sender_id: members[index].id,
        content: body.content,
        kind: "chat",
        client_operation_id: body.operationId,
        created_at: new Date().toISOString(),
      };
      sharedMessages.push(message);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message }) });
    })));
    await pages[2].route("**/api/room/REFRESH3/exit", (route) => {
      explicitExitCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ room: null, session: { id: "session-refresh-3", roomCode: "REFRESH3", status: "cancelled" } }),
      });
    });
    await Promise.all(pages.map((page) => page.goto("/index.html#/home")));
    await Promise.all(pages.map((page, index) => loginAs(page, members[index])));
    await Promise.all(pages.map((page) => resumeRoomFromHome(page)));

    for (const page of pages) {
      await expect(page).toHaveURL(/#\/room$/);
      await expect(page.locator("[data-session-preview] .session-preview-player:not(.session-preview-player--joining)")).toHaveCount(3);
      await expect(page.getByText("0/3 已确认，所有成员都确认后进入赛后反馈。", { exact: true })).toBeVisible();
    }

    await pages[0].locator("#chat-input").fill("刷新前消息");
    await pages[0].locator('[data-form="room-chat"] button[type="submit"]').click();
    await expect(pages[0].locator("#chat-input")).toHaveValue("");

    await Promise.all([pages[0].reload(), pages[1].reload()]);
    await pages[1].goto("/index.html#/me");
    await expect(pages[1]).toHaveURL(/#\/me$/);
    await pages[1].goto("/index.html#/room");

    for (const page of pages) {
      await expect(page).toHaveURL(/#\/room$/);
      await expect(page.locator("[data-session-preview] .session-preview-player:not(.session-preview-player--joining)")).toHaveCount(3);
      await expect(page.getByText("0/3 已确认，所有成员都确认后进入赛后反馈。", { exact: true })).toBeVisible();
    }
    await pages[0].locator("#chat-input").fill("刷新后仍可聊天");
    await pages[0].locator('[data-form="room-chat"] button[type="submit"]').click();
    await expect(pages[0].locator("#chat-input")).toHaveValue("");
    await pages[2].getByRole("button", { name: "离开", exact: true }).click();
    await pages[2].getByRole("dialog", { name: "主动离开游戏" }).getByRole("button", { name: "主动离开", exact: true }).click();
    await expect(pages[2]).toHaveURL(/#\/home$/);
    expect(explicitExitCalls).toBe(1);
    expect(captures).toEqual([{ offline: 0 }, { offline: 0 }, { offline: 0 }]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("Phase 0 mobile viewport baseline is explicit at every Phase 1 target width", async ({ browser }) => {
  const mobileViewports = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
  ];

  for (const viewport of mobileViewports) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto("/index.html");
    await expect(page.getByRole("heading", { name: "请使用电脑打开" })).toBeVisible();
    await expect(page.getByText(/Windows \/ macOS/)).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.pageWidth, `mobile baseline must not overflow at ${viewport.width}px`).toBeLessThanOrEqual(geometry.viewportWidth);
    await context.close();
  }
});

test("a narrow desktop window is not mistaken for a phone", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 844 });
  await page.goto("/index.html");
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "请使用电脑打开" })).toBeHidden();
});

test("desktop remains usable at the CSS viewport equivalent of 125% browser zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 });
  await page.goto("/index.html#/home");
  await expect(page.locator(".pc-only-gate")).toBeHidden();
  await expect(page.locator("#app")).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("signed-in top bar exposes player id and logout", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html#/home");
  await login(page);
  const railAvatar = page.locator(".product-account--signed .avatar-wrap");
  const collapsedAvatar = await railAvatar.boundingBox();
  await page.locator("[data-staggered-rail]").hover();
  const expandedAvatar = await railAvatar.boundingBox();
  expect(expandedAvatar?.width).toBe(collapsedAvatar?.width);
  expect(expandedAvatar?.height).toBe(collapsedAvatar?.height);
  await page.mouse.move(800, 400);
  await expect.poll(() => page.locator("[data-staggered-rail]").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
  const recollapsedAvatar = await railAvatar.boundingBox();
  expect(recollapsedAvatar?.width).toBe(collapsedAvatar?.width);
  expect(recollapsedAvatar?.height).toBe(collapsedAvatar?.height);
  await expect(page.getByRole("button", { name: /登出/ })).toBeVisible();
  await page.getByRole("button", { name: /登出/ }).click();
  await expect(page.locator(".landing-auth")).toBeVisible();
  await expect(page).toHaveURL(/#\/hero$/);
});

test("my page renders backend recent connections instead of stale local history", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html#/home");
  await login(page);
  await page.getByRole("link", { name: "我的", exact: true }).click();

  await expect(page).toHaveURL(/#\/me$/);
  await expect(page.getByText("旧队友", { exact: true })).toBeVisible();
  await expect(page.getByText(/Deadlock · 一起玩过 3 次/)).toBeVisible();
});

test("friend code search sends a request to the exact profile without a fullscreen transition", async ({ page }) => {
  const capture: { friendAdd?: Record<string, unknown> } = {};
  await mockProductBackend(page, capture);
  await page.goto("/index.html#/home");
  await login(page);
  await page.goto("/index.html#/friends");
  await expect(page).toHaveURL(/#\/me$/);
  await expect(page.getByText("好友系统正在重新设计", { exact: false })).toBeVisible();
});

test("completed sessions restore friendship controls and feedback responds before saving", async ({ page }) => {
  await mockProductBackend(page);
  await page.addInitScript(() => window.sessionStorage.setItem("jiyuan_pending_postgame_session_id", "session-completed"));
  let partnerLiked = false;
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      friendRequests: { incoming: [], outgoing: [] },
      recentConnections: [mockRecentConnection],
      room: null,
      session: {
        id: "session-completed",
        roomCode: "DONE42",
        players: [mockProfile.id, mockPartner.id],
        members: [
          { ...mockProfile, memberStatus: "active" },
          { ...mockPartner, likedByMe: partnerLiked },
        ],
        targetTotalPlayers: 2,
        need: { game: "deadlock", mode: "娱乐" },
        status: "completed",
      },
      matching: 0,
      playing: 0,
      matchmaking: { ticket: null, pair: null, candidate: null, matching: 0, matchable: 0 },
    }),
  }));
  await page.route("**/api/room/DONE42/feedback", async (route) => {
    const payload = route.request().postDataJSON() as { liked?: boolean };
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (typeof payload.liked === "boolean") partnerLiked = payload.liked;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await expect(page).toHaveURL(/#\/gameover$/);
  await expect(page.getByText("好友系统 COMING SOON", { exact: true })).toBeVisible();

  const like = page.locator("[data-gameover-like]").first();
  await expect(like).toHaveText("点赞");
  await like.click();
  await expect(like).toHaveText("已点赞");
  await expect(like).toHaveAttribute("aria-pressed", "true", { timeout: 250 });

  const rating = page.getByRole("button", { name: /01 很开心/ });
  await rating.click();
  await expect(rating).toHaveAttribute("aria-pressed", "true", { timeout: 250 });

  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await expect(page).toHaveURL(/#\/home$/);
  expect(await page.evaluate(() => window.sessionStorage.getItem("jiyuan_pending_postgame_session_id"))).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(700);
  await expect(page).toHaveURL(/#\/home$/);
});

test("completed casual Sessions keep each teammate like independent across refresh", async ({ page }) => {
  await mockProductBackend(page);
  await page.addInitScript(() => window.sessionStorage.setItem("jiyuan_pending_postgame_session_id", "session-completed-3"));
  const memberC = {
    id: "00000000-0000-0000-0000-000000000555",
    nickname: "第三位玩家",
    handle: "第三位玩家#0555",
    avatarKey: "me-3",
    device: "PC",
    online: true,
    memberStatus: "active",
    exitedAt: null,
  };
  const likedTargets = new Set<string>();
  const feedbackRequests: Record<string, unknown>[] = [];
  await page.unroute("**/api/state");
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      friendRequests: { incoming: [], outgoing: [] },
      recentConnections: [],
      room: null,
      session: {
        id: "session-completed-3",
        roomCode: "DONE43",
        players: [mockProfile.id, mockPartner.id, memberC.id],
        members: [
          { ...mockProfile, memberStatus: "active" },
          { ...mockPartner, likedByMe: likedTargets.has(mockPartner.id) },
          { ...memberC, likedByMe: likedTargets.has(memberC.id) },
        ],
        targetTotalPlayers: 3,
        need: { game: "deadlock", mode: "娱乐" },
        status: "completed",
      },
      matching: 0,
      playing: 0,
      matchmaking: { ticket: null, pair: null, candidate: null, group: null, matching: 0, matchable: 0 },
    }),
  }));
  await page.route("**/api/room/DONE43/feedback", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    feedbackRequests.push(payload);
    if (typeof payload.targetUserId === "string") {
      if (payload.liked) likedTargets.add(payload.targetUserId);
      else likedTargets.delete(payload.targetUserId);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/index.html#/home");
  await login(page);
  await expect(page).toHaveURL(/#\/gameover$/);
  const likes = page.locator("[data-gameover-like]");
  await expect(likes).toHaveCount(2);
  const first = likes.nth(0);
  const second = likes.nth(1);
  await expect(first).toHaveText("点赞");
  await expect(second).toHaveText("点赞");

  await first.click();
  await expect(first).toBeDisabled();
  await first.dispatchEvent("click");
  await expect.poll(() => feedbackRequests.filter((request) => request.targetUserId === mockPartner.id && request.liked === true).length).toBe(1);
  await expect(first).toHaveText("已点赞");
  await expect(second).toHaveText("点赞");
  await second.click();
  await expect.poll(() => feedbackRequests.filter((request) => request.targetUserId === memberC.id && request.liked === true).length).toBe(1);
  await expect(second).toHaveText("已点赞");
  await expect(first).toBeEnabled();
  await expect(first).toHaveAttribute("data-value", "no");
  await first.click();
  await expect.poll(() => feedbackRequests.filter((request) => request.targetUserId === mockPartner.id && request.liked === false).length).toBe(1);
  await expect(first).toHaveText("点赞");
  await expect(second).toHaveText("已点赞");

  await page.reload();
  await expect(page).toHaveURL(/#\/gameover$/);
  await expect(page.locator("[data-gameover-like]").nth(0)).toHaveText("点赞");
  await expect(page.locator("[data-gameover-like]").nth(1)).toHaveText("已点赞");
  await page.getByRole("button", { name: /01 很开心/ }).click();
  await expect(page.getByRole("button", { name: /01 很开心/ })).toBeDisabled();
  await page.getByRole("button", { name: /01 很开心/ }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: /01 很开心/ })).toHaveAttribute("aria-pressed", "true");
  expect(feedbackRequests).toEqual(expect.arrayContaining([
    expect.objectContaining({ targetUserId: mockPartner.id, liked: true }),
    expect.objectContaining({ targetUserId: mockPartner.id, liked: false }),
    expect.objectContaining({ targetUserId: memberC.id, liked: true }),
    expect.objectContaining({ rating: "happy" }),
  ]));
});

test("community is a separate clean route", async ({ page }) => {
  await page.goto("/index.html#/home");
  await page.getByRole("link", { name: "社区", exact: true }).click();

  await expect(page).toHaveURL(/#\/community$/);
  await expect(page.getByRole("heading", { name: "社区", exact: true })).toBeVisible();
  await expect(page.getByText("COMING SOON", { exact: true })).toBeVisible();
});
