import { expect, test, type APIRequestContext } from "@playwright/test";

test("the product shell opens", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/project S beta/);
  await expect(page.locator("#app")).toBeVisible();
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
  expect(started.session.status).toBe("playing");
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
