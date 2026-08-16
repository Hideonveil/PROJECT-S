import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

async function mockLandingBackend(page: Page, capture: { profile?: Record<string, unknown>; need?: Record<string, unknown> } = {}) {
  let profileExists = true;
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ supabaseUrl: "https://supabase.test", supabaseAnonKey: "test-anon-key" }),
  }));
  await page.route("https://supabase.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      access_token: "test-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "test-refresh-token",
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@project-s.local",
        user_metadata: { username: "testplayer" },
      },
    }),
  }));
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ email: "test@project-s.local" }),
  }));
  await page.route("**/api/auth/register", (route) => {
    profileExists = false;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ email: "test@project-s.local" }),
    });
  });
  await page.route("**/api/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, profile: profileExists ? mockProfile : null }),
  }));
  await page.route("**/api/register", (route) => {
    profileExists = true;
    capture.profile = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: mockProfile }),
    });
  });
  await page.route("**/api/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: mockProfile,
      friends: [],
      recentConnections: [],
      applications: [],
      room: null,
      session: null,
      needs: [],
      matching: 8,
      playing: 3,
      matchRequestId: null,
    }),
  }));
  await page.route("**/api/need", (route) => {
    capture.need = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "match-request-1", candidates: [], matching: 8, playing: 3 }),
    });
  });
  await page.route("**/api/cancel-need", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
}

async function loginFromLanding(page: Page) {
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const panel = page.locator("[data-landing-auth-panel]");
  await panel.locator("#landing-login-account").fill("testplayer");
  await panel.locator("#landing-login-password").fill("Phase1-test!");
  await panel.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByLabel("账号入口").getByText("测试玩家", { exact: true })).toBeVisible();
}

async function registerToIdentity(page: Page) {
  await page.getByRole("button", { name: "注册", exact: true }).click();
  const panel = page.locator("[data-landing-auth-panel]");
  await panel.locator("#landing-register-account").fill("testplayer");
  await panel.locator("#landing-register-password").fill("Phase1-test!");
  await panel.locator("#landing-register-password-confirm").fill("Phase1-test!");
  await panel.getByRole("button", { name: "继续创建玩家身份", exact: true }).click();
  await expect(page.locator("[data-landing-identity-panel]")).toBeVisible();
}

test("the product shell opens", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/project S beta/);
  await expect(page.locator("#app")).toBeVisible();
});

test("first-time visitors see the public home before authentication", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator('[data-page="landing"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "注册", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "摇人", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "社区", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "我的", exact: true })).toBeVisible();
  await expect(page.getByText("联系我们", { exact: true })).toBeVisible();
  await expect(page.getByText("总有人想一起", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page).not.toHaveURL(/#\/auth$/);
  await expect(page.locator("[data-landing-auth-panel]")).toBeVisible();
  await expect(page.locator(".landing")).toHaveClass(/is-auth-flow-open/);
});

test("landing uses same-color ticket stubs with a dashed half-tear", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.getByText("NEVER PLAY ALONE", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".landing-block-arrow, .landing-block-mark")).toHaveCount(0);

  const expectedSizes = new Map([
    [".landing-block--match", { width: 350, height: 200 }],
    [".landing-block--community", { width: 300, height: 150 }],
    [".landing-block--mine", { width: 300, height: 150 }],
  ]);

  for (const [selector, expectedSize] of expectedSizes) {
    const tile = page.locator(selector);
    const stub = tile.locator(".landing-ticket-stub");
    const bounds = await tile.boundingBox();
    expect(bounds?.width).toBe(expectedSize.width);
    expect(bounds?.height).toBe(expectedSize.height);
    await expect(stub).toHaveCount(1);
    const stubBefore = await stub.evaluate((element) => getComputedStyle(element).transform);
    const tearBefore = await tile.evaluate((element) => getComputedStyle(element, "::after").clipPath);
    const bodyBackground = await tile.evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
    const stubBackground = await stub.evaluate((element) => getComputedStyle(element).backgroundImage);
    const bodyColor = await tile.evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
    const stubColor = await stub.evaluate((element) => getComputedStyle(element).backgroundColor);
    await tile.hover();
    await page.waitForTimeout(220);
    const stubAfter = await stub.evaluate((element) => getComputedStyle(element).transform);
    const tearAfter = await tile.evaluate((element) => getComputedStyle(element, "::after").clipPath);
    expect(stubAfter).not.toBe(stubBefore);
    expect(tearAfter).not.toBe(tearBefore);
    expect(bodyBackground).toBe("none");
    expect(stubBackground).toContain("radial-gradient");
    expect(stubColor).toBe(bodyColor);
    await expect(tile).toHaveCSS("box-shadow", "none");
  }

  await page.locator(".landing-block--match").hover();
  await expect(page.locator(".landing-block--match")).toHaveCSS("animation-name", "landing-match-shake");

  const contact = await page.locator(".landing-contact").boundingBox();
  expect(contact?.width).toBeLessThanOrEqual(302);
  expect(contact?.height).toBeLessThanOrEqual(106);

  await page.setViewportSize({ width: 840, height: 900 });
  const narrowContact = await page.locator(".landing-contact").boundingBox();
  expect(narrowContact?.width).toBeLessThanOrEqual(302);
  expect(narrowContact?.height).toBeLessThanOrEqual(106);
});

test("landing auth opens on the ribbon right without blurring the moving ribbon", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  const panel = page.locator("[data-landing-auth-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".landing-auth-fields--login-account").getByLabel("账号", { exact: true })).toBeVisible();
  await expect(panel.locator(".landing-auth-fields--login-account").getByLabel("密码", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("确认密码", { exact: true })).toBeHidden();
  await expect(panel.getByRole("tab", { name: "手机号", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: "邮箱", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: "微信", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: "QQ", exact: true })).toHaveCount(0);

  await panel.getByRole("tab", { name: "注册", exact: true }).click();
  await expect(panel.locator(".landing-auth-fields--register-account").getByLabel("确认密码", { exact: true })).toBeVisible();
  const ribbonRightOffset = await page.locator(".landing").evaluate((element) => getComputedStyle(element).getPropertyValue("--landing-ribbon-edge-offset").trim());
  expect(ribbonRightOffset).toBe("28px");
  const authContent = await panel.locator(".landing-auth-content").boundingBox();
  expect(authContent?.y).toBeLessThanOrEqual(190);
  const registerAction = await panel.getByRole("button", { name: "继续创建玩家身份", exact: true }).boundingBox();
  expect((registerAction?.y || 0) + (registerAction?.height || 0)).toBeLessThanOrEqual(page.viewportSize()?.height || 0);
  await expect(page.locator("[data-landing-ribbon]")).toHaveCSS("filter", "none");
  await expect(page.locator(".landing-ribbon-track")).toHaveCSS("animation-play-state", "running");
});

test("visual registration continues to the ribbon left identity panel", async ({ page }) => {
  await mockLandingBackend(page);
  await page.goto("/index.html");
  await registerToIdentity(page);

  const identity = page.locator("[data-landing-identity-panel]");
  await expect(identity).toBeVisible();
  await expect(identity.getByText("头像", { exact: true })).toBeVisible();
  await expect(identity.getByText("性别", { exact: true })).toBeVisible();
  await expect(identity.getByText("年龄", { exact: true })).toBeVisible();
  await expect(identity.getByText("设备", { exact: true })).toBeVisible();
  await expect(identity.getByText("爱好游戏类型", { exact: true })).toBeVisible();
  const identityContent = await identity.locator(".landing-identity-content").boundingBox();
  expect(identityContent?.y).toBeLessThanOrEqual(82);
  const identitySeam = await page.locator(".landing").evaluate((element) => getComputedStyle(element).getPropertyValue("--landing-identity-seam-top").trim());
  expect(identitySeam).toContain("- 28px");
  await expect(page.locator("[data-landing-ribbon]")).toHaveCSS("filter", "none");
});

test("landing registration saves a real player identity payload", async ({ page }) => {
  const capture: { profile?: Record<string, unknown> } = {};
  await mockLandingBackend(page, capture);
  await page.goto("/index.html");
  await registerToIdentity(page);

  const identity = page.locator("[data-landing-identity-panel]");
  await identity.locator("#landing-profile-nickname").fill("新玩家");
  await identity.locator('[data-landing-profile-group="age"] [data-value="30+"]').click();
  await identity.getByRole("button", { name: "完成", exact: true }).click();

  await expect(page.getByLabel("账号入口").getByText("测试玩家", { exact: true })).toBeVisible();
  expect(capture.profile).toMatchObject({
    nickname: "新玩家",
    avatarKey: "me-1",
    gender: "保密",
    ageRange: "30+",
    device: "PC",
    genres: ["FPS", "MOBA"],
  });
});

test("the ribbon stays fixed through registration and identity creation", async ({ page }) => {
  await mockLandingBackend(page);
  await page.goto("/index.html");
  const ribbon = page.locator("[data-landing-ribbon]");
  const originalTransform = await ribbon.evaluate((element) => getComputedStyle(element).transform);

  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.waitForTimeout(650);
  await expect(ribbon).toHaveCSS("transform", originalTransform);

  const panel = page.locator("[data-landing-auth-panel]");
  await panel.locator("#landing-register-account").fill("testplayer");
  await panel.locator("#landing-register-password").fill("Phase1-test!");
  await panel.locator("#landing-register-password-confirm").fill("Phase1-test!");
  await panel.getByRole("button", { name: "继续创建玩家身份", exact: true }).click();
  await page.waitForTimeout(800);
  await expect(ribbon).toHaveCSS("transform", originalTransform);
});

test("auth and identity surfaces enter horizontally from opposite sides", async ({ page }) => {
  await page.goto("/index.html");
  const vectors = await page.evaluate(() => {
    const auth = new DOMMatrix(getComputedStyle(document.querySelector(".landing-auth-panel")!).transform);
    const identity = new DOMMatrix(getComputedStyle(document.querySelector(".landing-identity-panel")!).transform);
    return {
      width: window.innerWidth,
      auth: { x: auth.e, y: auth.f, scale: auth.a },
      identity: { x: identity.e, y: identity.f, scale: identity.a },
    };
  });

  expect(vectors.auth.x).toBeGreaterThan(vectors.width * 0.9);
  expect(Math.abs(vectors.auth.y)).toBeLessThan(1);
  expect(vectors.auth.scale).toBeCloseTo(1, 2);
  expect(vectors.identity.x).toBeLessThan(vectors.width * -0.9);
  expect(Math.abs(vectors.identity.y)).toBeLessThan(1);
  expect(vectors.identity.scale).toBeCloseTo(1, 2);
});

test("shake expands into the public match filter surface", async ({ page }) => {
  await page.goto("/index.html");

  await page.locator(".landing-block--match").click();

  await expect(page.locator("[data-landing-match]")).toBeVisible();
  await expect(page.getByText("选择游戏", { exact: true })).toBeVisible();
  await expect(page.getByText("什么时候玩", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="landing-match-submit"]')).toBeVisible();
  await expect(page.locator(".landing")).toHaveClass(/is-match-open/);
});

test("public shake becomes a visual full-screen matching state and exits home", async ({ page }) => {
  const capture: { need?: Record<string, unknown> } = {};
  await mockLandingBackend(page, capture);
  await page.goto("/index.html");
  await loginFromLanding(page);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator(".landing-block--match").click();
  await page.locator('[data-landing-filter-group="game"] [data-value="deadlock"]').click();
  await page.locator('[data-landing-filter-group="mode"] [data-value="认真上分"]').click();
  await page.locator('[data-action="landing-match-submit"]').click();

  await expect(page).not.toHaveURL(/#\/(auth|matching)$/);
  await expect(page.locator(".landing")).toHaveClass(/is-visual-matching/);

  const visualMatch = page.locator("[data-landing-visual-match]");
  await expect(visualMatch).toBeVisible();
  await expect(visualMatch.getByText("Deadlock", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("认真上分", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("现在", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("1 人", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("需要", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("匹配池人数", { exact: true })).toBeVisible();
  await expect(visualMatch.getByText("正在游戏", { exact: true })).toBeVisible();
  expect(capture.need).toMatchObject({
    need: {
      game: "deadlock",
      mode: "认真上分",
      current: 1,
      target: 2,
      voice: true,
    },
  });

  await page.waitForTimeout(600);
  const clipPath = await page.locator(".landing-match-surface").evaluate((element) => getComputedStyle(element).clipPath);
  expect(clipPath.replaceAll(" ", "")).toBe("polygon(0px0px,100%0px,100%100%,0px100%)");

  await visualMatch.getByRole("button", { name: "退出匹配", exact: true }).click();
  await expect(page.locator(".landing")).toHaveClass(/is-visual-matching-exit/);
  const exitTarget = await page.locator(".landing-match-layer").evaluate((element) => ({
    x: getComputedStyle(element).getPropertyValue("--landing-match-exit-x").trim(),
    y: getComputedStyle(element).getPropertyValue("--landing-match-exit-y").trim(),
    scaleX: getComputedStyle(element).getPropertyValue("--landing-match-exit-scale-x").trim(),
    scaleY: getComputedStyle(element).getPropertyValue("--landing-match-exit-scale-y").trim()
  }));
  expect(exitTarget.x).toMatch(/px$/);
  expect(exitTarget.y).toMatch(/px$/);
  expect(Number(exitTarget.scaleX)).toBeLessThan(1);
  expect(Number(exitTarget.scaleY)).toBeLessThan(1);
  const exitClipPath = await page.locator(".landing-match-surface").evaluate((element) => getComputedStyle(element).clipPath);
  expect(exitClipPath.replaceAll(" ", "")).toBe("polygon(0px0px,100%0px,100%100%,0px100%)");
  await expect(page.locator(".landing-match-layer")).toHaveCSS("transition-property", "transform, opacity");
  await expect(page.locator(".landing-match-layer")).toHaveCSS("transition-duration", "0.64s, 0.12s");
  await page.waitForTimeout(600);
  const alignedRects = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".landing-match-layer")!.getBoundingClientRect();
    const button = document.querySelector<HTMLElement>(".landing-block--match")!.getBoundingClientRect();
    return {
      surface: { left: surface.left, top: surface.top, width: surface.width, height: surface.height },
      button: { left: button.left, top: button.top, width: button.width, height: button.height }
    };
  });
  expect(Math.abs(alignedRects.surface.left - alignedRects.button.left)).toBeLessThan(3);
  expect(Math.abs(alignedRects.surface.top - alignedRects.button.top)).toBeLessThan(3);
  expect(Math.abs(alignedRects.surface.width - alignedRects.button.width)).toBeLessThan(3);
  expect(Math.abs(alignedRects.surface.height - alignedRects.button.height)).toBeLessThan(3);
  await expect(page.locator(".landing")).not.toHaveClass(/is-visual-matching/);
  await expect(page.locator(".landing")).not.toHaveClass(/is-match-open/, { timeout: 1_200 });
  await expect(page.locator(".landing-menu")).toBeVisible();
});

test("community expands into an empty horizontal surface", async ({ page }) => {
  await page.goto("/index.html");

  await page.locator(".landing-block--community").click();

  await expect(page.locator("[data-landing-community]")).toBeVisible();
  await expect(page.locator("[data-landing-community]").getByText("社区", { exact: true })).toBeVisible();
  await expect(page.locator("[data-landing-community]").getByText("COMING SOON", { exact: true })).toBeVisible();
  await expect(page.locator(".landing")).toHaveClass(/is-community-open/);
});

test("mine expands diagonally with profile and connection summaries", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator(".landing-block--mine").click();

  const mine = page.locator("[data-landing-mine]");
  await expect(mine).toBeVisible();
  await expect(mine.getByText("基本信息", { exact: true })).toBeVisible();
  await expect(mine.getByText("朋友", { exact: true })).toBeVisible();
  await expect(mine.getByText("最近匹配的人", { exact: true })).toBeVisible();
  await expect(page.locator(".landing")).toHaveClass(/is-mine-open/);
});

test("two real users complete the MVP loop and create exactly one rematch room", async ({ request }) => {
  test.skip(process.env.E2E_RUN_MUTATING !== "1", "Set E2E_RUN_MUTATING=1 against an isolated test deployment");
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = `Phase1-${suffix}!`;
  const config = await json(request, "GET", "/api/config");

  async function createPlayer(label: string) {
    const username = `p1${label}${suffix}`.slice(0, 24);
    const account = await json(request, "POST", "/api/auth/register", { username, password });
    const auth = await request.post(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      data: { email: account.email, password },
    });
    expect(auth.ok()).toBeTruthy();
    const token = (await auth.json()).access_token as string;
    const profile = await json(request, "POST", "/api/register", {
      nickname: `测试${label}`, genres: ["沙盒"], device: "PC", voice: true,
    }, token);
    return { token, id: profile.user.id };
  }

  const [a, b] = await Promise.all([createPlayer("A"), createPlayer("B")]);
  const need = {
    game: "minecraft", mode: "生存联机", goal: "E2E闭环", current: 1, target: 2,
    time: "现在开始", duration: "30", voice: true, playerType: "轻松", details: {},
  };
  await Promise.all([
    json(request, "POST", "/api/need", { need }, a.token),
    json(request, "POST", "/api/need", { need }, b.token),
  ]);
  await json(request, "POST", "/api/apply", { toUserId: b.id }, a.token);
  const accepted = await json(request, "POST", "/api/apply", { toUserId: a.id }, b.token);
  expect(accepted.room.sessionStatus).toBe("ready");
  const code = accepted.room.code as string;

  const started = await json(request, "POST", `/api/room/${code}/start`, {}, a.token);
  expect(started.room.sessionStatus).toBe("playing");
  const [finishedA, finishedB] = await Promise.all([
    json(request, "POST", `/api/room/${code}/finish`, {}, a.token),
    json(request, "POST", `/api/room/${code}/finish`, {}, b.token),
  ]);
  expect(finishedA.session.status).toBe("completed");
  expect(finishedB.session.status).toBe("completed");

  const [stateA, stateB] = await Promise.all([
    json(request, "GET", "/api/state", undefined, a.token),
    json(request, "GET", "/api/state", undefined, b.token),
  ]);
  expect(stateA.recentConnections.some((c: { player: { id: string } }) => c.player.id === b.id)).toBeTruthy();
  expect(stateB.recentConnections.some((c: { player: { id: string } }) => c.player.id === a.id)).toBeTruthy();
  expect(stateA.recentConnections.filter((c: { player: { id: string } }) => c.player.id === b.id)).toHaveLength(1);

  const directProfiles = await request.get(`${config.supabaseUrl}/rest/v1/profiles?select=id,friend_code,game_accounts`, {
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${a.token}` },
  });
  expect(directProfiles.ok()).toBeTruthy();
  const visibleProfiles = await directProfiles.json();
  expect(visibleProfiles).toHaveLength(1);
  expect(visibleProfiles[0].id).toBe(a.id);

  const directEvents = await request.get(`${config.supabaseUrl}/rest/v1/product_events?select=id`, {
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${a.token}` },
  });
  expect(directEvents.ok()).toBeTruthy();
  expect(await directEvents.json()).toEqual([]);

  const first = await json(request, "POST", `/api/room/${code}/rematch`, { choice: "yes" }, a.token);
  expect(first.resolution).toBe("waiting");
  const second = await json(request, "POST", `/api/room/${code}/rematch`, { choice: "yes" }, b.token);
  expect(second.resolution).toBe("accepted");
  expect(second.room.code).not.toBe(code);
  const repeated = await json(request, "POST", `/api/room/${code}/rematch`, { choice: "yes" }, b.token);
  expect(repeated.room.id).toBe(second.room.id);
});

async function json(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
  token?: string
) {
  const response = await request.fetch(path, {
    method,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await response.json();
  expect(response.ok(), `${method} ${path}: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}
