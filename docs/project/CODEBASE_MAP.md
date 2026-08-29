# 机缘代码地图（小白版）

这份地图回答三个问题：页面在哪里、业务规则在哪里、出了问题先看哪里。

## 一条正常请求怎么走

```text
浏览器页面 public/
  ↓ 调用
Next API src/app/api/
  ↓ 委托
业务模块 src/lib/
  ↓ 读写
Supabase / PostgreSQL
```

原则：API 路由只接收和返回请求；Matching、Room、Session 等规则放在 `src/lib/`；浏览器不自己猜数据库状态。

## 根目录

| 目录 | 大白话说明 | 什么时候看 |
| --- | --- | --- |
| `public/` | 用户真正看到的旧式单页前端、图片和样式 | 页面闪烁、Room 显示、按钮、聊天 |
| `src/app/api/` | 网站的 HTTP 接口入口 | 某个 `/api/...` 请求报错 |
| `src/lib/` | 后端业务规则和数据库访问 | 匹配不到、Room 生命周期、Session、权限 |
| `supabase/migrations/` | Production 数据库的只增不改历史 | 表、RPC、RLS、索引变化 |
| `src/app/ops/` | 轻量内部运营后台 | User/Room Inspector、人工操作 |
| `tools/capacity/` | Synthetic 账号和容量测试 Runner | 40/75/200 人测试 |
| `deploy/` | 腾讯云和本地 OPS 的部署配置 | 构建、容器、Caddy、监控 |
| `tests/` | 产品契约和浏览器回归 | 修改前写失败测试，修改后验收 |
| `docs/project/` | 当前事实、决策、问题和运行规范 | 不确定产品规则时先看 |
| `output/` | 测试证据，不是源码 | 查历史结果；不能当代码合并 |

## 浏览器前端 `public/js/`

| 文件 | 唯一职责 |
| --- | --- |
| `app.js` | 浏览器总编排：路由、渲染入口、把用户动作交给专门模块。仍是下一阶段最大的拆分对象 |
| `room-authority.js` | **Room 权威裁判**：决定哪个 Room 有效、快照新旧、能否恢复、退出后是否禁止旧 Room 回弹 |
| `room-chat-controller.js` | Room 聊天：历史加载、发送、失败、Realtime 合并、刷新恢复 |
| `auth-controller.js` | 登录、注册、邮箱验证、Session 恢复、设备顶号 |
| `matchmaking-snapshot.js` | Ticket/Pair/Group 的局部响应合并，不让缺字段误清状态 |
| `room-roster.js` | 成员加入、离开与局部成员栏更新 |
| `session-members.js` | Session 参与者与 Room active member 的区别 |
| `session-scope.js` | 判断一个 Session 是否真的属于当前 Room |
| `api.js` | 浏览器访问后端的统一入口、超时、请求 ID、幂等键 |
| `pages/` | 各页面的 HTML 结构；不应该拥有数据库业务规则 |
| `realtime.js` | Supabase Realtime 订阅连接 |
| `store.js` | 当前浏览器内存状态 |

### Room Authority 的简单规则

```text
开始匹配 / 用户确认恢复
  → 可以接受一个新的 Room

State / Realtime / Hydration
  → 只能补充当前同一个 Room
  → 旧版本不能覆盖新版本
  → 同版本的简版 Shell 不能盖掉完整成员
  → 另一个 Room 不能突然把页面顶走

每次全状态读取
  → 记住请求发出时的 Room 代次
  → 旧请求晚回来时，不能用空结果清掉后来创建的新 Room

用户点击离开
  → 先立 tombstone（临时禁止回弹）
  → 成功后永久禁止该旧 Room 回弹
  → 失败才撤销 tombstone
```

## 后端核心 `src/lib/`

### Matching

`src/lib/matchmaking/` 已按职责拆开：

- `service.ts`：小型公开入口，只编排，不重复实现规则。
- `ranked.ts`：Ranked 候选与 Pair。
- `casual.ts`：Casual Room、forming/backfill。
- `direct-join.ts`：指定候选加入现有 Room。
- `scheduler.ts`：持续 Matcher、lease、冷却、并发上限。
- `reservations.ts`：把业务竞争和真正数据库错误分开。
- `runtime-telemetry.ts`：attempt/success/conflict/storm 指标。
- `rules.ts`：兼容条件。
- `ticket-store.ts`：Ticket 读取与状态保存。

### Room / Session

- `room-read-model.ts`：Room shell、完整 hydration、恢复资格的后端事实源。
- `room-presentation.ts`：统一输出给浏览器的 Room 形状。
- `room-lifecycle.ts`：Room 成员、Recruitment 与终态收敛。
- `room-snapshot.ts`：带版本的 Room 快照。
- `session.ts`：Session 创建和状态。
- `session-goodbye.ts`：拜拜、结算参与者与终态处理。
- `state-snapshot.ts`：`/api/state` 的聚合读取。

### 其他

- `auth.ts`、`presence.ts`：登录身份与在线状态。
- `keyed-serial-queue.ts`：同一用户 mutation 串行，避免重入竞态。
- `ops-v2/`：OPS 只读模型、权限、审计和受保护干预。
- `metrics.ts`、`health.ts`：运行指标与健康检查。

## API 入口 `src/app/api/`

按 URL 一一对应。例如：

```text
/api/matchmaking/start
→ src/app/api/matchmaking/start/route.ts
→ src/lib/matchmaking/service.ts

/api/room/ABC/messages
→ src/app/api/room/[code]/messages/route.ts
→ Room/Chat 数据规则
```

API 路由应保持短小。如果这里出现大段 Matching 或 Room 规则，说明规则放错地方。

## 数据库 `supabase/migrations/`

Migration 按时间向前追加。Production 已执行的文件不能改写；新变化必须新增 migration。重要边界：

- 浏览器使用普通用户身份和 RLS。
- service/admin 只用于授权的 provisioning 或受保护 Admin API。
- 业务冲突不能伪装成 PostgreSQL `40001`。
- 不能用 raw SQL 删除 Room/Ticket 来把测试“清绿”。

## 测试怎么分

| 测试 | 作用 |
| --- | --- |
| `tests/room-authority.test.mjs` | Room 新旧、来源、退出 tombstone 的纯规则 |
| `tests/*contract*` | 模块与调用方之间不能破坏的接口合同 |
| `tests/e2e/mvp-closure.spec.ts` | 从账号、配置、Room、聊天、拜拜、刷新到离开的真实浏览器流程 |
| `src/lib/**/*.test.ts` | 后端业务模块的行为测试 |
| `tools/capacity/` | 多账号并发，不替代 correctness 测试 |

## 出问题时先查哪里

| 现象 | 第一站 | 第二站 |
| --- | --- | --- |
| 点击匹配后旧 Room 回弹 | `room-authority.js` | `room-read-model.ts` |
| A 看见 B、B 看不见 A | `room-snapshot.ts` / Realtime | `room-roster.js` |
| 聊天单边丢失 | `room-chat-controller.js` | messages API / Realtime |
| 匹配一直不发生 | `matchmaking/scheduler.ts` | `ranked.ts` / `casual.ts` |
| CPU conflict storm | `reservations.ts` | `runtime-telemetry.ts` |
| 拜拜要点两次 | `session-goodbye.ts` | Room mutation snapshot / `room-authority.js` |
| 结算缺队友 | Session participant 快照 | `session-members.js` |
| UI 整页闪一下 | `app.js` 是否调用整页 `render()` | 专门的局部 patch 函数 |

## 新增游戏时

不要复制一套 Matching。按照 DEC-015：

1. 在共享 `GameDefinition` registry 注册游戏。
2. 把该游戏的段位、位置、人数和兼容规则放进游戏 adapter。
3. 继续复用 Auth → Ticket → Room → Session → terminal 主链路。
4. 先用一个 fake game 跑契约测试，再接真实素材与规则。

当前 registry/adapter 仍是下一阶段工作；在它完成前不要在通用编排里继续增加散落的游戏名判断。
