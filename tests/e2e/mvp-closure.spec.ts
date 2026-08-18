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
  capture: { profile?: Record<string, unknown>; need?: Record<string, unknown> } = {}
) {
  let profileExists = true;
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
        applications: [],
        room: null,
        session: null,
        needs: [],
        matching: 8,
        playing: 3,
        matchRequestId: null,
      }),
    })
  );
  await page.route("**/api/need", (route) => {
    capture.need = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "match-request-1", candidates: [], matching: 8, playing: 3 }),
    });
  });
  await page.route("**/api/cancel-need", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
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
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "找 1 人", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "现在", exact: true })).toHaveAttribute("aria-pressed", "true");
}

test("first-time visitors land on the real matching home", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page).toHaveTitle(/project S beta/);
  await expect(page.locator(".product-shell")).toBeVisible();
  await expect(page.locator('[data-page="landing"]')).toHaveCount(0);
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
  await page.goto("/index.html");

  await page.getByRole("button", { name: /Deadlock/ }).click();
  await expect(page.getByRole("button", { name: "上分", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回游戏", exact: true }).click();
  await page.getByRole("button", { name: /我的世界/ }).click();
  await expect(page.getByRole("heading", { name: "我的世界还在准备。" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Deadlock rank and casual paths expose different step systems", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const stage = page.locator("[data-home-wizard-stage]");
  await stage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "上分", exact: true }).click();
  await expect(stage).toHaveAttribute("data-test-persisted", "yes");
  const stepper = page.locator("[data-home-stepper]");
  await expect(stepper).toHaveAttribute("aria-label", "Deadlock 配置进度：第 1 步，共 6 步");
  await stepper.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(stepper).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.getByRole("button", { name: /新人/ })).toBeVisible();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("请选择当前段位", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /近卫/ }).click();
  await expect(page.getByRole("button", { name: /近卫/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: /1号位/ })).toBeVisible();
  await page.getByRole("button", { name: /1号位/ }).click();
  await page.getByRole("button", { name: /2号位/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: /3号位/ }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("上分最好开麦哦", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "现在", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "开始匹配", exact: true })).toBeVisible();

  await page.goto("/index.html?casual-path=1#/home");
  await page.getByRole("button", { name: /Deadlock/ }).click();
  const casualStage = page.locator("[data-home-wizard-stage]");
  await casualStage.evaluate((element) => element.setAttribute("data-test-persisted", "yes"));
  await page.getByRole("button", { name: "娱乐", exact: true }).click();
  await expect(casualStage).toHaveAttribute("data-test-persisted", "yes");
  await expect(page.locator("[data-home-stepper]")).toHaveAttribute("aria-label", "Deadlock 配置进度：第 1 步，共 4 步");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByText("上分最好开麦哦", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("button", { name: "找 5 人", exact: true })).toBeVisible();
});

test("navigation keeps icon-only rest state and staggers open on hover", async ({ page }) => {
  await page.goto("/index.html");
  const rail = page.locator("[data-staggered-rail]");
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
  await rail.hover();
  await expect(rail).toHaveClass(/is-staggered-open/);
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  await expect(page.locator(".product-nav-link > span").first()).toHaveCSS("opacity", "1");
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
  await page.goto("/index.html");
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();

  await expect(page).toHaveURL(/#\/auth$/);
  await expect(page.getByRole("heading", { name: "回来继续摇人。" })).toBeVisible();
  await expect(page.getByText("登录后即可开始匹配。", { exact: true })).toBeVisible();
});

test("registration continues to player identity and stores the real profile payload", async ({ page }) => {
  const capture: { profile?: Record<string, unknown> } = {};
  await mockProductBackend(page, capture);
  await page.goto("/index.html");

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
  await page.goto("/index.html");
  const game = page.getByRole("button", { name: /Deadlock/ });
  await game.hover();
  await expect(page.locator(".target-cursor")).toHaveClass(/is-visible/);
  await expect(page.locator(".target-cursor")).toHaveClass(/is-locked/);

  await game.click();
  await page.getByRole("button", { name: "下一步", exact: true }).hover();
  await expect(page.locator(".target-cursor")).not.toHaveClass(/is-visible/);

  await page.getByRole("button", { name: "娱乐", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "开始匹配", exact: true }).hover();
  await expect(page.locator(".target-cursor")).not.toHaveClass(/is-visible/);
});

test("authenticated matching opens the new focused modal and removes the old panel", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html");
  await login(page);
  await reachDeadlockCasualFinal(page);
  await page.getByRole("button", { name: "开始匹配", exact: true }).click();
  const transition = page.locator("[data-project-transition]");
  await expect(transition).toBeVisible();
  await expect(transition).toHaveAttribute("aria-label", "正在进入匹配池");
  await expect(transition.locator(".project-transition-device")).toHaveCount(6);
  await expect(transition.locator(".project-transition-tape-track")).toHaveCount(2);
  const tapeBefore = await transition.locator(".project-transition-tape-track").first().evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(180);
  const tapeAfter = await transition.locator(".project-transition-tape-track").first().evaluate((element) => getComputedStyle(element).transform);
  expect(tapeAfter).not.toBe(tapeBefore);
  await expect(page).toHaveURL(/#\/matching$/);
  await expect(transition).toHaveCount(0);
  const modal = page.locator("[data-matching-modal]");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS("opacity", "1");
  await expect(page.getByRole("heading", { name: "正在找同一局的人。" })).toBeVisible();
  await expect(page.locator(".matching-panel, .prism-matching")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "退出匹配", exact: true })).toHaveCount(2);
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
  await expect(page.getByRole("heading", { name: "摇人" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "请使用电脑打开" })).toBeHidden();
});

test("signed-in top bar exposes player id and logout", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html");
  await login(page);
  await expect(page.getByRole("button", { name: /登出/ })).toBeVisible();
  await page.getByRole("button", { name: /登出/ }).click();
  await expect(page.locator(".product-auth-actions")).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
});

test("my page renders backend recent connections instead of stale local history", async ({ page }) => {
  await mockProductBackend(page);
  await page.goto("/index.html");
  await login(page);
  await page.getByRole("link", { name: "我的", exact: true }).click();

  await expect(page).toHaveURL(/#\/me$/);
  await expect(page.getByText("旧队友", { exact: true })).toBeVisible();
  await expect(page.getByText(/Deadlock · 3 次/)).toBeVisible();
});

test("community is a separate clean route", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("link", { name: "社区", exact: true }).click();

  await expect(page).toHaveURL(/#\/community$/);
  await expect(page.getByRole("heading", { name: "社区", exact: true })).toBeVisible();
  await expect(page.getByText("COMING SOON", { exact: true })).toBeVisible();
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
