# PROJECT-S Room Connection Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成已确认的十项改进，让玩家从选择 Deadlock 条件、实时确认、进入房间、申请站内好友、双方“拜拜”、评价并返回产品的流程真实闭环，而且任何局部状态变化都不会触发整页刷新。

**Architecture:** 保留现有 Next.js API + Supabase + 原生 JavaScript 前端结构。数据库负责房间结束与好友关系的最终一致性；API 只暴露经过鉴权的幂等命令；Realtime 负责把候选确认、拜拜与好友申请推送给双方；前端使用局部 DOM patch 和轻量提示，不通过重新 `render()` 表达单字段变化。

**Tech Stack:** Next.js 15 Route Handlers、TypeScript、Supabase Postgres/Auth/Realtime、原生 JavaScript/CSS、GSAP、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-19-room-connection-flow-design.md`

## Global Constraints

- 不修改 Deadlock 官方硬约束，也不写死新的匹配权重。
- 不恢复任何已退役页面或旧匹配入口。
- 正常结束必须由双方各自确认“拜拜”；单方退出仍是异常退出，不生成正常评价闭环。
- 好友关系必须经过接收方确认，不能把“发出申请”等同于“已经是好友”。
- 候选确认、房间好友申请、拜拜和评价只更新相关组件，不重建整个页面。
- 所有新增写操作必须幂等，并由服务端依据当前登录用户识别 actor；客户端不得直接写内部表。
- 每个任务完成后执行该任务的聚焦测试；全量验证只在最后执行。

---

## Task 1: 锁定十项需求的浏览器行为契约

**Files:**

- Modify: `tests/e2e/mvp-closure.spec.ts`
- Modify: `tests/friends-and-retired-flow-contract.test.ts`
- Create: `tests/room-connection-flow-contract.test.ts`

- [ ] **Step 1: 为 Deadlock 两条路径写失败测试**

在 `tests/e2e/mvp-closure.spec.ts` 增加以下断言：

```ts
test("ranked combines own and teammate roles while casual asks teammate count", async ({ page }) => {
  // ranked: rank -> roles -> voice
  // roles 同屏出现“我的位置（可多选）”和“希望队友位置（可多选）”
  // casual: goal -> team -> voice，且不存在队友位置
});
```

同时在 1366×768 viewport 下断言选完游戏后的“下一步”完整可见，`boundingBox().y + height <= innerHeight`。

- [ ] **Step 2: 为 hero 到登录/注册的专用转场写失败测试**

测试 hero 点击“登录”和“注册”后先出现 `[data-project-transition]`，再进入 auth；从侧栏或 auth 内切换登录/注册时不得再次出现全屏转场。

- [ ] **Step 3: 为候选确认的局部更新写失败测试**

构造候选双方状态变化，给匹配根节点添加测试属性，模拟 Realtime/state patch 后断言：

```ts
await expect(candidateRoot).toHaveAttribute("data-test-persisted", "yes");
await expect(page.getByText("对方已接受")).toBeVisible();
```

- [ ] **Step 4: 为房间导航、好友申请、拜拜和评价写失败测试**

覆盖：

- 房间中点击“我的”可进入 `#/me`，不会被强制拉回房间。
- A 发好友申请后 B 看到确认提示；B 接受后双方显示“已是好友”。
- A 点击拜拜只显示等待 B，不结束房间；B 确认后双方进入结束页。
- 结束页没有“是否愿意再一起”，点赞位于对方资料旁，评价点击不替换页面根节点。

- [ ] **Step 5: 增加静态契约测试阻止旧逻辑回归**

在 `tests/room-connection-flow-contract.test.ts` 读取源码并断言：

```ts
expect(appSource).not.toContain('if (patch.room && routeName !== "room")');
expect(roomSource).not.toContain("开始游戏");
expect(gameoverSource).not.toContain("下次还愿意");
```

- [ ] **Step 6: 运行聚焦测试并确认红灯原因正确**

Run:

```bash
pnpm vitest run tests/room-connection-flow-contract.test.ts tests/friends-and-retired-flow-contract.test.ts
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "ranked combines|hero auth|candidate confirmation|room connection"
```

Expected: 新断言因功能尚未实现失败；不得出现测试本身语法错误。

- [ ] **Step 7: 提交测试契约**

```bash
git add tests/e2e/mvp-closure.spec.ts tests/friends-and-retired-flow-contract.test.ts tests/room-connection-flow-contract.test.ts
git commit -m "test: define room connection flow"
```

## Task 2: 修复 Deadlock 步进路径与底部裁切

**Files:**

- Modify: `public/js/pages/home.js`
- Modify: `public/js/app.js`
- Modify: `public/styles/product-shell.css`
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] **Step 1: 将步骤路径改成模式专属配置**

在 `public/js/pages/home.js` 统一导出：

```js
export const DEADLOCK_PATHS = {
  ranked: ["goal", "rank", "roles", "voice"],
  casual: ["goal", "team", "voice"],
};
```

删除流程中的独立 `ownRoles` / `teammateRoles` 页面，但保留 `HOME_FILTER.ownRoles` 和 `HOME_FILTER.teammateRoles` 两组数据。

- [ ] **Step 2: 实现 ranked 的合并位置步骤**

`wizardContent("roles")` 同屏渲染：

- “我的位置” + 顶部醒目的“可多选”标记。
- “希望队友位置” + 顶部醒目的“可多选”标记。
- 1～6 号位与“不限”；“不限”与具体位置互斥。

- [ ] **Step 3: 实现 casual 队友人数步骤**

`wizardContent("team")` 仅渲染“希望找几位队友”，选项 1～5；不渲染任何位置选择。

- [ ] **Step 4: 同步请求负载**

在 `syncHomeFilterToDraft()` 中保持：

```js
draft.currentRoles = HOME_FILTER.mode === "ranked" ? HOME_FILTER.ownRoles : [];
draft.teammateRoles = HOME_FILTER.mode === "ranked" ? HOME_FILTER.teammateRoles : [];
draft.needed = HOME_FILTER.mode === "casual" ? HOME_FILTER.team : 1;
```

- [ ] **Step 5: 修复小视口底部安全空间**

给 wizard 内容区使用可滚动主体、固定但不遮挡的 footer，并提供至少 `calc(var(--wizard-footer-height) + 24px)` 的底部 padding。不得通过缩小按钮文字规避裁切。

- [ ] **Step 6: 运行并通过聚焦 E2E**

```bash
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "ranked combines|Deadlock rank and casual"
```

- [ ] **Step 7: 提交**

```bash
git add public/js/pages/home.js public/js/app.js public/styles/product-shell.css tests/e2e/mvp-closure.spec.ts
git commit -m "feat: refine Deadlock match steps"
```

## Task 3: 增加 hero 专用登录注册转场

**Files:**

- Modify: `public/js/app.js`
- Modify: `public/js/pages/landing.js`
- Modify: `public/js/transition.js`
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] **Step 1: 写一个只处理 hero -> auth 的入口函数**

在 `public/js/app.js` 增加：

```js
async function enterAuthFromHero(mode) {
  await playProjectTransition({ duration: 560, text: null });
  AUTH_MODE = mode;
  navigate("#/auth");
}
```

转场只显示紫色背景和现有设备图标，不显示文案。

- [ ] **Step 2: hero 登录与注册动作改用专用入口**

`landing.js` 的两个按钮携带独立 action；`handleAction()` 调用 `enterAuthFromHero("login" | "register")`。

- [ ] **Step 3: 保持 auth 内部切换为局部动画**

登录/注册切换仅更新表单层，不调用全屏 transition，不影响底部警戒线 loop。

- [ ] **Step 4: 运行并通过 hero auth E2E**

```bash
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "hero auth"
```

- [ ] **Step 5: 提交**

```bash
git add public/js/app.js public/js/pages/landing.js public/js/transition.js tests/e2e/mvp-closure.spec.ts
git commit -m "feat: add hero auth transition"
```

## Task 4: 建立双方拜拜的数据库原子状态

**Files:**

- Create via Supabase CLI: migration named `mutual_goodbye_and_friend_requests`
- Modify: `tests/migration-contract.test.ts`
- Create: `tests/session-goodbye-migration-contract.test.ts`

- [ ] **Step 1: 使用 Supabase CLI 创建迁移文件**

Run:

```bash
supabase migration new mutual_goodbye_and_friend_requests
```

使用该命令实际返回的精确文件路径，不手写时间戳文件名。

- [ ] **Step 2: 先写迁移契约红灯测试**

断言迁移包含：

- `session_goodbye_requests` 表。
- `unique (session_id, user_id)`。
- Realtime publication。
- 禁止客户端直接写的 RLS/权限。
- `phase1_request_goodbye` RPC。
- `phase1_request_friendship` 与 `phase1_respond_friendship` RPC。
- 对 session/room 行加锁。
- `mutual_goodbye` completion reason。
- 匹配确认完成后 room/session 直接进入 `playing`。

- [ ] **Step 3: 创建拜拜请求表**

表结构必须为：

```sql
create table public.session_goodbye_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);
```

- [ ] **Step 4: 实现幂等 RPC**

RPC 签名：

```sql
phase1_request_goodbye(
  p_session_id uuid,
  p_actor_id uuid,
  p_requested boolean,
  p_request_id uuid
)
```

事务内完成：成员校验、playing 状态校验、幂等 upsert/delete、统计仍在房间的活跃成员、双方都确认时调用既有 session 完成逻辑并记录 `completion_reason = 'mutual_goodbye'`。

- [ ] **Step 5: 收紧权限并加入 Realtime**

`revoke execute` from public/anon/authenticated，只允许 `service_role`；表只允许服务端访问，但允许经过 Realtime 授权的订阅读取必要行。

同一迁移增加两个好友 RPC，把“首次申请、反向同时申请自动接受、接收方接受/拒绝”放在数据库事务中完成：

```sql
phase1_request_friendship(p_actor_id uuid, p_target_id uuid)
phase1_respond_friendship(p_receiver_id uuid, p_requester_id uuid, p_decision text)
```

两个函数都锁定相关 directed friendship rows，拒绝自己加自己，并只授权 `service_role` 执行。

- [ ] **Step 6: 修改匹配确认落地状态**

双方确认时创建的 room/session 直接为 `playing`，填充 `started_at`，不再等待房间内“开始游戏”。

- [ ] **Step 7: 运行迁移契约测试**

```bash
pnpm vitest run tests/migration-contract.test.ts tests/session-goodbye-migration-contract.test.ts
```

- [ ] **Step 8: 提交**

```bash
git add supabase/migrations tests/migration-contract.test.ts tests/session-goodbye-migration-contract.test.ts
git commit -m "feat: add mutual goodbye lifecycle"
```

## Task 5: 提供拜拜 API 与完整 state 视图

**Files:**

- Create: `src/lib/session-goodbye.ts`
- Create: `src/lib/session-goodbye.test.ts`
- Create: `src/app/api/room/[code]/goodbye/route.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/state/route.ts`
- Modify: `public/js/api.js`

- [ ] **Step 1: 为命令解析和响应映射写单元测试**

定义：

```ts
export type GoodbyeCommand = { requested: boolean };
export type GoodbyeRequestView = { userId: string; requestedAt: string };

export function parseGoodbyeCommand(input: unknown): GoodbyeCommand;
export function mapGoodbyeRequests(rows: unknown[]): GoodbyeRequestView[];
```

覆盖布尔校验、空行、重复用户和非法数据。

- [ ] **Step 2: 实现 `/api/room/[code]/goodbye`**

POST 流程：鉴权 -> 找当前 profile -> 找 room/session -> 调用 `phase1_request_goodbye` -> 返回最新 room/session/goodbyeRequests。重复请求必须返回相同有效状态，而不是 409。

- [ ] **Step 3: 扩展 Room 类型和 state**

在 `Room` 增加：

```ts
goodbyeRequests: Array<{ userId: string; requestedAt: string }>;
```

`enrichRoom()` 一次性读取当前 session 的请求，`/api/state` 返回给客户端。

- [ ] **Step 4: 增加浏览器 API helper**

```js
export function requestRoomGoodbye(code, requested) {
  return request(`/api/room/${encodeURIComponent(code)}/goodbye`, {
    method: "POST",
    body: { requested },
  });
}
```

- [ ] **Step 5: 运行测试与类型检查**

```bash
pnpm vitest run src/lib/session-goodbye.test.ts
pnpm typecheck
```

- [ ] **Step 6: 提交**

```bash
git add src/lib/session-goodbye.ts src/lib/session-goodbye.test.ts src/app/api/room/[code]/goodbye/route.ts src/lib/api.ts src/lib/types.ts src/app/api/state/route.ts public/js/api.js
git commit -m "feat: expose mutual goodbye state"
```

## Task 6: 把站内好友改成申请与确认

**Files:**

- Create: `src/lib/friend-requests.ts`
- Create: `src/lib/friend-requests.test.ts`
- Modify: `src/app/api/friends/add/route.ts`
- Create: `src/app/api/friends/respond/route.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/app/api/state/route.ts`
- Modify: `src/lib/types.ts`
- Modify: `public/js/api.js`
- Modify: `tests/friends-and-retired-flow-contract.test.ts`

- [ ] **Step 1: 写好友状态转换测试**

定义并测试：

```ts
type FriendDecision = "accepted" | "rejected";

function planFriendRequest(current, actorId, targetId): FriendMutationPlan;
function planFriendResponse(current, requesterId, receiverId, decision): FriendMutationPlan;
```

覆盖首次申请、重复申请、反向同时申请、接受、拒绝、已经 accepted、自己加自己。

- [ ] **Step 2: 修改 add 路由只创建 pending**

A -> B 通过 `phase1_request_friendship` 只写一条 `user_id=A, friend_id=B, status='pending'`。如果已存在 B -> A pending，RPC 在同一事务中合并成双向 accepted，避免同时申请互相覆盖。

- [ ] **Step 3: 新增 respond 路由**

请求：

```json
{ "requesterId": "uuid", "decision": "accepted" }
```

只有 receiver 可以处理。路由调用 `phase1_respond_friendship`；accepted 创建/更新双向 accepted，rejected 删除 pending，不生成好友。

- [ ] **Step 4: 修正 friends 查询**

`friendsFor()` 只返回 `status='accepted'`。新增：

```ts
incomingFriendRequestsFor(userId)
outgoingFriendRequestsFor(userId)
```

并在 `/api/state` 中返回 `friendRequests: { incoming, outgoing }`。

- [ ] **Step 5: 增加浏览器 API helper**

```js
export const respondFriendRequest = (requesterId, decision) =>
  request("/api/friends/respond", { method: "POST", body: { requesterId, decision } });
```

- [ ] **Step 6: 运行聚焦测试**

```bash
pnpm vitest run src/lib/friend-requests.test.ts tests/friends-and-retired-flow-contract.test.ts
pnpm typecheck
```

- [ ] **Step 7: 提交**

```bash
git add src/lib/friend-requests.ts src/lib/friend-requests.test.ts src/app/api/friends/add/route.ts src/app/api/friends/respond/route.ts src/lib/api.ts src/app/api/state/route.ts src/lib/types.ts public/js/api.js tests/friends-and-retired-flow-contract.test.ts
git commit -m "feat: add confirmable friend requests"
```

## Task 7: 让 Realtime 只 patch 当前组件，不刷新页面

**Files:**

- Modify: `public/js/realtime.js`
- Modify: `public/js/store.js`
- Modify: `public/js/app.js`
- Modify: `public/js/pages/matching.js`
- Modify: `public/js/pages/room.js`
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] **Step 1: 扩展订阅表**

订阅：`session_goodbye_requests`、`friendships`，继续订阅 matching/session/room 相关表。事件回调先合并 state，再调用页面专用 updater。

- [ ] **Step 2: 去掉 active room 强制导航**

删除 `applyServerSnapshot()` 中“只要有 room 就导航回 room”的规则。只在从匹配成功第一次生成 room 时执行一次 `navigate("#/room")`，其余 state 更新保持当前 route。

- [ ] **Step 3: 房间存在时提供明确入口**

侧栏展示“进行中的房间”状态/入口；用户在“我的”或“社区”页时可以主动返回房间，而不是被系统拉回。

- [ ] **Step 4: 候选确认使用局部 updater**

`updateMatchingView()` 仅更新双方确认标记和小提示：

```js
patchText("[data-partner-confirmation]", partnerAccepted ? "对方已接受" : "等待对方接受");
```

不能调用根级 `render()`；超时只显示“对方没有接受”，保留匹配页框架和等待时间。

- [ ] **Step 5: 房间使用局部 updater**

新增 `updateRoomView(nextRoom)`，只 patch：

- 对方账号。
- 好友申请状态。
- 双方拜拜状态。
- 小提示和按钮 disabled/label。

- [ ] **Step 6: 通过局部更新与导航 E2E**

```bash
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "candidate confirmation|room navigation|friend request|mutual goodbye"
```

- [ ] **Step 7: 提交**

```bash
git add public/js/realtime.js public/js/store.js public/js/app.js public/js/pages/matching.js public/js/pages/room.js tests/e2e/mvp-closure.spec.ts
git commit -m "fix: patch live room state in place"
```

## Task 8: 重建房间为“临时连接舱”并接通双方拜拜

**Files:**

- Modify: `public/js/pages/room.js`
- Modify: `public/js/app.js`
- Modify: `public/styles/pages.css`
- Modify: `public/styles/product-shell.css`
- Delete: `src/app/api/room/[code]/start/route.ts`
- Modify: `tests/room-connection-flow-contract.test.ts`
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] **Step 1: 用语义区块替换通用 card 堆叠**

房间结构固定为：

```html
<main class="connection-room">
  <header class="connection-room__status"></header>
  <section class="connection-room__players"></section>
  <section class="connection-room__exchange"></section>
  <section class="connection-room__chat"></section>
  <section class="connection-room__farewell"></section>
</main>
```

双方资料左右对称，中间为连接轴；账号与好友状态归属到对应玩家，不单独漂浮。

- [ ] **Step 2: 应用房间 tokens**

在 CSS 定义：

```css
.connection-room {
  --room-paper: #f5f3ef;
  --room-ink: #111118;
  --room-violet: #8b6cff;
  --room-mist: #eae4ff;
  --room-online: #4fae5a;
  --room-exit: #d6534d;
}
```

警戒线作为连接状态元素，不能成为页面底部装饰复制品；动效使用 transform/opacity，支持 `prefers-reduced-motion`。

- [ ] **Step 3: 删除“开始游戏”**

房间进入即为 playing。删除前端 `startGame()`、按钮和 `/api/room/[code]/start` 路由；全仓 `rg "开始游戏|/start"` 确认无调用后再删。

- [ ] **Step 4: 实现拜拜交互**

大按钮文案仅“拜拜”。第一次点击打开确认层“确定要拜拜吗？”；确认后：

- 自己显示“已提出拜拜”。
- 对方显示“对方想结束这次匹配，是否拜拜？”
- 双方都确认后进入 gameover。
- 发起方在对方确认前可以撤回。

- [ ] **Step 5: 接通房间好友确认**

对方申请时，在对方资料附近显示：“对方申请加你为 PROJECT-S 好友”，提供“接受 / 暂不”按钮；不是浏览器 alert。

- [ ] **Step 6: 保持异常退出语义**

“退出房间”仍调用既有 exit 路径，标记 `member_exited`，不走拜拜、不进入正常评价。

- [ ] **Step 7: 运行房间 E2E 和契约测试**

```bash
pnpm vitest run tests/room-connection-flow-contract.test.ts
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "room navigation|friend request|mutual goodbye|abnormal exit"
```

- [ ] **Step 8: 提交**

```bash
git add public/js/pages/room.js public/js/app.js public/styles/pages.css public/styles/product-shell.css src/app/api/room/[code]/start/route.ts tests/room-connection-flow-contract.test.ts tests/e2e/mvp-closure.spec.ts
git commit -m "feat: redesign the live connection room"
```

## Task 9: 重建结束评价并消除点击卡顿

**Files:**

- Modify: `public/js/pages/gameover.js`
- Modify: `public/js/app.js`
- Modify: `public/js/api.js`
- Modify: `src/app/api/room/[code]/feedback/route.ts`
- Modify: `public/styles/pages.css`
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] **Step 1: 将评价收敛为两个字段**

UI 只提交：

```ts
{ liked?: boolean; rating?: "happy" | "meh" | "bad" }
```

数据库历史 `want_again` 列暂不删除，避免破坏旧数据；新 UI 与新请求不再读写它。

- [ ] **Step 2: 重排结束页**

信息层级：

1. 对方身份。
2. 头像旁醒目的点赞按钮。
3. 好友按钮或“已是好友”。
4. 开心 / 一般 / 不佳三个体验选项。
5. 最近一起玩 / 返回首页。

- [ ] **Step 3: 使用乐观局部更新**

点击点赞、好友或评价时立即 patch 按钮；后台请求失败才回滚并显示局部错误。禁止调用 `render()`：

```js
const rollback = patchFeedbackControl(control, nextValue);
try {
  await saveRoomFeedback(...);
} catch (error) {
  rollback();
  showInlineNotice("保存失败，请再试一次");
}
```

- [ ] **Step 4: 通过评价 E2E**

测试根节点保持、按钮即时更新、请求失败回滚、没有 want-again 文案。

```bash
pnpm playwright test tests/e2e/mvp-closure.spec.ts --grep "gameover feedback"
```

- [ ] **Step 5: 提交**

```bash
git add public/js/pages/gameover.js public/js/app.js public/js/api.js src/app/api/room/[code]/feedback/route.ts public/styles/pages.css tests/e2e/mvp-closure.spec.ts
git commit -m "feat: simplify post-game feedback"
```

## Task 10: 清理退役路径并完成全链路验证

**Files:**

- Modify: `tests/room-connection-flow-contract.test.ts`
- Modify: `tests/e2e/mvp-closure.spec.ts`
- Modify only if verification exposes a defect: files touched in Tasks 2–9

- [ ] **Step 1: 全仓检索退役入口**

Run:

```bash
rg -n "开始游戏|下次还愿意|wantAgain|room/.*/start|routeName !== \"room\"|legacy|old-page" public src tests
```

Expected: 只允许兼容历史数据的服务端 `want_again` 字段和明确的测试说明；没有可点击旧入口。

- [ ] **Step 2: 执行静态与单元验证**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 全部通过，无未处理 promise、类型错误或构建警告导致的功能降级。

- [ ] **Step 3: 执行完整本地 E2E**

```bash
pnpm playwright test
```

重点人工查看录屏/截图：1366×768 底部按钮、hero auth 转场、candidate 局部确认、房间导航、好友接受、双方拜拜、结束评价。

- [ ] **Step 4: 在本地 Supabase 验证并发与幂等**

依次验证：

- A 连点拜拜只产生一条记录。
- A 撤回后 B 不能单独完成。
- A/B 同时确认只完成一次 session。
- 已完成 session 重放请求返回相同结果。
- A/B 同时互发好友申请只形成双向 accepted，不产生重复关系。

- [ ] **Step 5: 检查数据库安全与性能建议**

使用 Supabase advisors 检查新表的 RLS、安全函数搜索路径、外键索引与慢查询；修复本次迁移引入的问题，不扩大到无关历史告警。

- [ ] **Step 6: 代码审查**

使用 `superpowers:requesting-code-review` 对 Tasks 2–9 的差异做完整审查，优先检查并发、状态恢复、权限和整页 render 回归。

- [ ] **Step 7: 复验后提交最终清理**

```bash
git add -A
git commit -m "chore: verify room connection closure"
```

如果没有额外修改，不创建空提交。

- [ ] **Step 8: 上线前必须再次验证**

使用 `superpowers:verification-before-completion`，保留命令输出证据；然后按现有 GitHub/Vercel 发布流程推送并部署。

- [ ] **Step 9: 生产环境双浏览器验收**

两个独立登录会话完整走一遍：

```text
hero -> auth -> 选择 Deadlock -> 加入池 -> 双方确认 -> 房间
-> 交换账号 -> 发好友申请/接受 -> A 拜拜 -> B 拜拜
-> 点赞/评价 -> 最近一起玩
```

同时验证房间内打开“我的”不会被拉回、生产控制台无错误、Vercel Function 无新增 5xx、Supabase 无残留 playing session 或孤立 goodbye request。

## Final Acceptance Checklist

- [ ] 十项用户需求都有自动化断言或明确的人工验收步骤。
- [ ] 候选确认、好友申请、拜拜与评价均为局部更新。
- [ ] 房间可以离开浏览，但有明确入口返回。
- [ ] 正常结束只可能由双方拜拜完成。
- [ ] 好友必须由接收方确认。
- [ ] ranked 与 casual 步骤、负载语义正确。
- [ ] 旧“开始游戏”、旧好友直加、旧 want-again UI 不再可达。
- [ ] TypeScript、Vitest、build、完整 Playwright 均通过。
- [ ] 生产双用户流程通过，数据库无幽灵状态。
