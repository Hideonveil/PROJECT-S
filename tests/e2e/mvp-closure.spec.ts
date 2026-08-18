import { expect, test, type Page } from "@playwright/test";
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

async function mockProductBackend(
  page: Page,
  capture: { profile?: Record<string, unknown>; match?: Record<string, unknown>; friendAdd?: Record<string, unknown> } = {}
) {
  let profileExists = true;
  const matchStartedAt = new Date().toISOString();
  await page.route("**/api/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ supabaseUrl: "https://supabase.test", supabaseAnonKey: "test-anon-key" }),
    })
  );
  await page.route("https://supabase.test/**", (route) =>
    route.fulfill({
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
    })
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "test@project-s.local" }) })
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
        ticket: { id: "ticket-1", state: "searching", search_started_at: matchStartedAt }, pair: null, candidate: null, matching: 8, matchable: 8,
      }),
    });
  });
  await page.route("**/api/matchmaking/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: { id: "ticket-1", state: "searching", search_started_at: matchStartedAt }, pair: null, candidate: null, matching: 8, matchable: 8 }) })
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
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        friends: [{
          id: "00000000-0000-0000-0000-000000000333",
          nickname: "代码好友",
          avatarKey: "",
          online: true,
          device: "PC",
        }],
      }),
    });
  });
}

async function login(page: Page) {
  await page.locator(".product-auth-actions").getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#auth-username").fill("testplayer");
  await page.locator("#auth-password").fill("Phase1-test!");
  await page.locator(".product-auth-submit").click();
  await expect(page.locator(".product-topbar-user span")).toHaveText("测试玩家");
  await expect(page.locator(".product-topbar-user small")).toHaveText("测试玩家#0111");
}

async function reachDeadlockCasualFinal(page: Page) {
  await page.getByRole("button", { name: /Deadlock/ }).click();
  await page.getByRole("button", { name: "娱乐", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "不限", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();
}

test("first-time visitors land on the hero and enter the matching workspace", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page).toHaveTitle(/project S beta/);
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.locator(".product-rail")).toHaveCount(0);
  await expect(page.locator(".landing-brand")).toHaveAttribute("href", "#/hero");
  await expect(page.locator(".landing-auth").getByRole("button", { name: "登录", exact: true })).toBeVisible();
  await expect(page.locator(".landing-auth").getByRole("button", { name: "注册", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入摇人匹配" })).toBeVisible();
  await expect(page.locator("#landing-title")).toContainText("总有人想一起玩");
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
  expect(pageHeight).toBeGreaterThan(1.3);
  expect(pageHeight).toBeLessThan(1.8);
  const heroMatch = page.getByRole("button", { name: "进入摇人匹配" });
  await expect.poll(() => heroMatch.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await heroMatch.hover();
  await expect.poll(() => heroMatch.evaluate((element) => getComputedStyle(element).animationName)).toContain("landingMatchHoverShake");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);
  const heroMatchBefore = await heroMatch.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(80);
  const heroMatchAfter = await heroMatch.boundingBox();
  expect(Math.abs((heroMatchBefore?.y || 0) - (heroMatchAfter?.y || 0))).toBeLessThan(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await heroMatch.click();
  await expect(page.locator("[data-project-transition]")).toBeVisible();
  await expect(page.locator(".product-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: /Deadlock/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "上分", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "上分", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回游戏", exact: true }).click();
  await page.getByRole("button", { name: /我的世界/ }).click();
  await expect(page.getByRole("heading", { name: "我的世界还在准备。" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Deadlock rank and casual paths expose different step systems", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/index.html#/home");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const nextButtonBox = await page.getByRole("button", { name: "下一步", exact: true }).boundingBox();
  expect((nextButtonBox?.y || 0) + (nextButtonBox?.height || 0)).toBeLessThanOrEqual(768);
  const stage = page.locator("[data-home-wizard-stage]");
  await stage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "上分", exact: true }).click();
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
  await expect(ownRoles.getByRole("button", { name: "1号位", exact: true }).locator(".match-role-number")).toContainText("1");
  await expect(ownRoles.getByRole("button", { name: "1号位", exact: true }).locator("small")).toHaveText("号位");
  await ownRoles.getByRole("button", { name: /2号位/ }).click();
  await teammateRoles.getByRole("button", { name: /3号位/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("上分最好开麦哦", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回选择游戏", exact: true }).click();
  await expect(page.getByRole("button", { name: /Deadlock/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /我的世界/ })).toBeVisible();

  await page.goto("/index.html?casual-path=1#/home");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const casualStage = page.locator("[data-home-wizard-stage]");
  await casualStage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "娱乐", exact: true }).click();
  await expect(casualStage).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator("[data-home-stepper]")).toHaveAttribute("aria-label", "Deadlock 配置进度：第 1 步，共 3 步");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("group", { name: "找几个人" })).toBeVisible();
  await expect(page.getByRole("group", { name: /位置/ })).toHaveCount(0);
  await page.getByRole("button", { name: "找 2 人", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("上分最好开麦哦", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "无所谓", exact: true })).toBeVisible();
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
  expect(afterRegister?.height).toBe(before?.height);

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

test("registration continues to player identity and stores the real profile payload", async ({ page }) => {
  const capture: { profile?: Record<string, unknown> } = {};
  await mockProductBackend(page, capture);
  await page.goto("/index.html#/home");

  await page.locator(".product-auth-actions").getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.locator("[data-registration-stepper]")).toHaveCount(0);
  await page.locator("#auth-username").fill("testplayer");
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

  await expect(page).toHaveURL(/#\/welcome$/);
  await expect(page.locator('[data-registration-stepper][aria-label="身份创建进度：第 1 步，共 5 步"]')).toBeVisible();
  await page.locator("[data-registration-stepper]").evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await expect(page.getByRole("button", { name: /头像 1/ })).toHaveCount(0);
  await page.locator("#nickname").fill("新玩家");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.locator('[aria-label="身份创建进度：第 2 步，共 5 步"]')).toBeVisible();
  await expect(page.locator("[data-registration-stepper]")).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator(".identity-form--step")).toHaveClass(/is-forward/);
  await page.getByRole("button", { name: /暂不设置头像/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: /FPS/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "保密", exact: true }).click();
  await expect(page.getByText("目前版本会优先匹配同性玩家。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /完成并进入 PROJECT-S/ }).click();

  await expect(page).toHaveURL(/#\/home$/);
  expect(capture.profile).toMatchObject({
    nickname: "新玩家",
    avatarKey: "",
    gender: "保密",
    device: "PC",
    genres: ["FPS"],
  });
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

  await page.getByRole("button", { name: "娱乐", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "不限", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "开始匹配", exact: true }).hover();
  await expect(page.locator(".target-cursor")).not.toHaveClass(/is-visible/);
});

test("authenticated matching opens the new focused modal and removes the old panel", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  const transition = page.locator("[data-project-transition]");
  await expect(transition).toBeVisible();
  await expect(transition).toHaveAttribute("aria-label", "正在进入匹配池");
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
  await expect(page).toHaveURL(/#\/matching$/);
  await expect(transition).toHaveCount(0);
  const modal = page.locator("[data-matching-modal]");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS("opacity", "1");
  await modal.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await expect(page.getByRole("heading", { name: "正在找同一局的人。" })).toBeVisible();
  await expect(page.locator(".matching-panel, .prism-matching")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "退出匹配", exact: true })).toHaveCount(2);
  await page.waitForTimeout(3200);
  await expect(modal).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator("#match-time")).not.toHaveText("0s");
});

test("candidate confirmation shows each player's independent ready state", async ({ page }) => {
  await mockProductBackend(page);
  await page.unroute("**/api/matchmaking/start");
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ticket: { id: "ticket-1", state: "waiting_confirmation", search_started_at: new Date().toISOString() },
      pair: {
        id: "pair-1",
        state: "waiting_confirmation",
        confirmations: [
          { user_id: mockProfile.id, decision: null },
          { user_id: "00000000-0000-0000-0000-000000000222", decision: "accepted" },
        ],
      },
      candidate: { id: "00000000-0000-0000-0000-000000000222", nickname: "已准备玩家" },
      matching: 0,
      matchable: 0,
    }),
  }));
  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();

  await expect(page.getByText("对方已确定，正在等你。", { exact: true })).toBeVisible();
  await expect(page.getByText("对方：已确定", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确定是 TA", exact: true })).toBeVisible();
});

test("confirmation timeout updates the existing matching modal without resetting it", async ({ page }) => {
  await mockProductBackend(page);
  const startedAt = new Date(Date.now() - 4000).toISOString();
  await page.unroute("**/api/matchmaking/start");
  await page.unroute("**/api/matchmaking/status");
  await page.route("**/api/matchmaking/start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ticket: { id: "ticket-1", state: "waiting_confirmation", search_started_at: startedAt },
      pair: {
        id: "pair-1",
        state: "waiting_confirmation",
        confirmations: [
          { user_id: mockProfile.id, decision: "accepted" },
          { user_id: "00000000-0000-0000-0000-000000000222", decision: null },
        ],
      },
      candidate: { id: "00000000-0000-0000-0000-000000000222", nickname: "超时玩家" },
      matching: 0,
      matchable: 0,
    }),
  }));
  await page.route("**/api/matchmaking/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ticket: { id: "ticket-1", state: "searching", search_started_at: startedAt },
      pair: null,
      candidate: null,
      matching: 1,
      matchable: 1,
    }),
  }));

  await page.goto("/index.html#/home");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  const modal = page.locator("[data-matching-modal]");
  await modal.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await expect(page.getByText("你已准备，正在等对方确定。", { exact: true })).toBeVisible();
  await expect(page.locator("#match-desc")).toHaveText("对方没有接受，正在继续寻找其他玩家。", { timeout: 5000 });
  await expect(modal).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator("#match-time")).not.toHaveText("0s");
});

test("mobile visitors see the PC-only gate in the same product language", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/index.html");
  await expect(page.getByRole("heading", { name: "请使用电脑打开" })).toBeVisible();
  await expect(page.getByText(/Windows \/ macOS/)).toBeVisible();
  await context.close();
});

test("a narrow desktop window is not mistaken for a phone", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 844 });
  await page.goto("/index.html");
  await expect(page.getByRole("button", { name: "进入摇人匹配" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "请使用电脑打开" })).toBeHidden();
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
  await expect(page.getByText(/Deadlock · 3 次/)).toBeVisible();
});

test("friend code search adds the exact searched profile without a fullscreen transition", async ({ page }) => {
  const capture: { friendAdd?: Record<string, unknown> } = {};
  await mockProductBackend(page, capture);
  await page.goto("/index.html#/home");
  await login(page);
  await page.goto("/index.html#/friends");

  await page.locator("#friend-code-input").fill("NODE-ABCD-EFGH");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator("[data-project-transition]")).toHaveCount(0);
  await expect(page.getByText("代码好友", { exact: true })).toBeVisible();
  await expect(page.getByText("NODE-ABCD-EFGH", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "添加好友", exact: true }).click();

  expect(capture.friendAdd).toMatchObject({ targetUserId: "00000000-0000-0000-0000-000000000333" });
  await expect(page.getByRole("heading", { name: "朋友列表", exact: true })).toBeVisible();
  await expect(page.getByText("代码好友", { exact: true })).toBeVisible();
});

test("community is a separate clean route", async ({ page }) => {
  await page.goto("/index.html#/home");
  await page.getByRole("link", { name: "社区", exact: true }).click();

  await expect(page).toHaveURL(/#\/community$/);
  await expect(page.getByRole("heading", { name: "社区", exact: true })).toBeVisible();
  await expect(page.getByText("COMING SOON", { exact: true })).toBeVisible();
});
