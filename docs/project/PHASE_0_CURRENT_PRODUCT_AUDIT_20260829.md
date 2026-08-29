# Phase 0｜当前 Production 与代码事实审计

> 日期：2026-08-29（Asia/Shanghai）
>
> 状态：`AUDIT COMPLETE / READ-ONLY`
>
> 范围：canonical Git、公开 Production、当前游戏扩展边界、前端页面、Matching / Room / Session、退役路径、移动端缺口。
>
> 本轮没有修改产品代码、数据库或 Production。

## 一句话结论

当前线上是一个 **Deadlock-only、PC-only 的 Room-first 产品**。后端 Auth → Ticket → Room → Session
主链路已经具备可扩展基础，但“游戏定义”还没有真正贯穿浏览器、状态目录、数据库规则和容量工具；手机端不是
“适配得不好”，而是被代码主动全屏拦截。四游戏与手机端可以在现有项目上继续建设，但不能直接堆三套游戏页面
或仅删除手机拦截层。

## 1. 基线事实

| 项目 | 审计结果 |
| --- | --- |
| Canonical root | `/Users/jasonhu/Documents/ChatGPT/project/JY_source` |
| Canonical origin | `github.com/Hideonveil/PROJECT-S` |
| 审计起点 | `origin/main = 5244941`（产品代码基线为其父提交 `093bbd5`） |
| Production 公开 runtime | `093bbd5` |
| Production health | `live / ready` |
| 公开健康快照 | `online=0`、`matching=0`、`playing=0`、`users=532`、DB health latency=`410ms` |
| Production prototype | `/prototype/matching-v2 = 404`，未对外开放 |
| TypeScript | PASS |
| Tests | `108 files / 457 tests PASS` |
| Production build | PASS，48 个 Next route 生成成功 |

补证边界：专用 SSH 本次被腾讯云扫码安全登录拦截，因此没有重新取得容器内部 `docker compose ps`、restart
和 OOM 快照。公开 health、线上 HTML 与本地 `origin/main` 已交叉核验；本报告不把缺失的容器内部证据写成 PASS。

## 2. 当前真正运行的产品模型

### 浏览器

Production 用户前端仍是 `public/index.html` 启动的原生 JavaScript SPA：

```text
public/index.html
  → public/js/app.js
  → public/js/pages/*
  → /api/*
```

Next.js 主要承担 API、OPS 和构建/部署外壳，并不是消费者前端的 React 路由器。

### 后端

```text
Auth
→ Matchmaking Ticket
→ Room shell
→ Persistent Matcher
→ Ranked Pair / Casual Group
→ Room projection
→ Session
→ Settlement / terminal convergence
```

Room-first、权威 Room projection、operation receipt、Realtime invalidation、恢复资格和幂等退出都在当前主线。
这部分是四游戏继续复用的核心资产，不应复制。

### 当前产品游戏

只有 `Deadlock` 真正可用：

- 服务端 `gameRegistry` 只注册 `deadlockGameDefinition`；
- 浏览器摇人首页只有 Deadlock 可进入配置；
- Production Matching rule set 只有 Deadlock 有当前可验证规则；
- 当前 Room、Profile 和容量 Runner 都以 Deadlock 为实际产品路径。

数据库历史 migration 中出现无畏契约、王者荣耀、原神等 `games` 行，只代表历史目录数据存在，**不代表这些游戏
已经接入当前 Matching、Room、Session 或 UI**。

## 3. 已经可复用的扩展基础

### 已完成

- `GameDefinition` / `GameRegistry` 接口已经建立；
- Deadlock 已作为第一个规则 adapter；
- fake game 测试证明规则 adapter 可以参与输入标准化和兼容判断；
- Matching 查询已经按 `game_id` 隔离主要候选池；
- Room / Session 核心生命周期没有绑定特定游戏名称；
- Room presentation 会携带 ticket/Room 中的游戏和配置；
- 数据库 `games`、ticket `game_id`、group `game_id`、recent connection `game_id` 已具备多游戏数据位置。

### 尚未贯通

- `/api/config` 只返回 Supabase public 配置，不返回可用游戏目录；
- 浏览器仍使用 `public/js/data.js` 和 `pages/home.js` 的静态游戏/Deadlock 配置；
- `public/js/pages/home.js` 的步骤、段位、位置和图片全部是 Deadlock 专用；
- `public/js/pages/me.js` 只展示 Deadlock identity；
- `src/lib/matchmaking/status.ts` 的人数和目录查询硬编码 `game_id = deadlock`；
- `src/lib/matchmaking/records.ts` 的数据库 row 类型把 `game_id` 写成字面量 `deadlock`；
- 容量 runner 的 workload 固定为 Deadlock；
- 无畏契约、王者荣耀没有当前 Matching rule set；三角洲行动连共享目录定义也没有；
- 各新游戏的正式素材、模式、段位、位置、人数、词汇和容量场景均未接入。

结论：DEC-015 的“扩展边界骨架”已经存在，但还不是从数据库到 UI 的完整产品插件系统。

## 4. 当前页面与路径清单

### Production 活动路径

| 路径 | 当前事实 |
| --- | --- |
| `#/hero` | 对外 Hero、实时目录摘要、登录/注册入口 |
| `#/auth` | 登录、注册、找回、邮箱验证 |
| `#/welcome` | 首次身份创建 |
| `#/home` | 游戏选择与 Deadlock 摇人配置 |
| `#/room` | 唯一 Room UI；招募、成员、条件、聊天、停止招募、拜拜、退出 |
| `#/gameover` | 赛后、点赞、评价、关系沉淀 |
| `#/connections` | 最近一起玩过的人 |
| `#/me` | 个人资料；当前只展示 Deadlock |
| `#/community` | 活动路由，但内容只是 Coming Soon |

### 已绕过或只保留兼容的路径

| 路径/文件 | 分类 |
| --- | --- |
| `#/matching` | Production 路由已绕过，只会回 Room 或 Home |
| `public/js/pages/matching.js` | 退役 Matching UI + 本地预览依赖；不应继续承载 Production 新功能 |
| `#/friends` | 已重定向 `#/me` |
| `public/js/pages/friends.js` | 旧独立 Friends 页面，没有被当前 app renderer 使用 |
| `/prototype/matching-v2` | dev-only；Production 404 |
| `public/js/matching-v2-prototype.js` | dev prototype 运行脚本，不是 Production 入口 |
| `/api/matchmaking/confirm`、`/group/start` | 兼容/退役路径，已有 deprecation 观测 |
| `/api/ops/manual-match` | OPS V1 旧路径；OPS V2 另有受保护 intervention API |

历史 migration 必须保留，不属于可删除的“废弃源码”；不得为了整理目录改写已经执行过的 migration。

## 5. 当前 Casual 事实

当前线上 Casual 配置不是旧的“随缘 / 速度 / 满人 / 更多”。当前用户可见配置只有：

```text
麦克风：开麦 / 不开麦 / 无所谓
偏好人数：不限 / 2 / 3 / 4 / 5 / 6 人
```

人数是排序偏好，不是硬分池。所有 Casual 用户进入同一个兼容池，系统优先补进已有 Room；Room 按 hard max
或成员停止招募锁定。

遗留事实：`HOME_FILTER.casualIntent`、`teamMin/teamMax`、部分旧 intent 事件和旧 Matching 页面仍在源码中，但不再
是当前可见产品模型。后续应先用观测/测试确认无调用，再删除或隔离，不能让新游戏继续依赖这些旧语义。

## 6. 移动端当前事实

移动端目前是 `NOT SUPPORTED`，原因是明确的产品 Gate：

```css
@media (max-width: 900px) and (hover: none) and (pointer: coarse) {
  .pc-only-gate { display: grid; }
}
```

`homeShell()` 与 Hero 都渲染“请使用电脑打开”全屏层，现有 E2E 还把该拦截行为写成 PASS 契约。

已有 CSS 中存在平板/窄屏响应式规则、`viewport-fit=cover`、局部 `svh/dvh` 和 reduced-motion，但这些只是 PC
页面压缩适配；触屏用户仍无法进入功能，不构成手机产品。

## 7. 前端结构风险

| 风险 | 当前证据 | 影响 |
| --- | --- | --- |
| 浏览器总编排过胖 | `public/js/app.js = 4188` 行 | 新游戏与手机版继续往里加分支会提高闪烁和竞态概率 |
| 样式单体过大 | `product-shell.css = 3167` 行，`pages.css = 2683` 行 | 手机覆盖规则容易互相覆盖，难以知道谁是最终样式 |
| 游戏目录双事实源 | 服务端 registry 与浏览器 `data.js` 分开 | UI 可以显示服务端并不支持的游戏 |
| 静态历史数据污染 | `DEFAULT_NEED.game = valorant`，Home 又只允许 Deadlock | localStorage/旧预览可能产生错误默认值 |
| 路由全量 render 风险 | `render()` 会清 timer、field、chat controller | 手机 resize/键盘/路由变化若误触全量 render，会出现闪烁或状态丢失 |
| 外部字体 | Production 从 Google Fonts 加载 Inter / Space Grotesk | 中国网络和微信环境可能慢或失败，并产生字体切换/layout shift |
| 首屏预加载固定 | 所有入口都 preload Deadlock、Coming Soon、Ranked、Casual 四张图 | Auth/Room/手机入口也承担不需要的请求 |
| 原始静态体积 | Supabase 约 212KB、GSAP 约 73KB、app.js 约 166KB、两主 CSS 约 231KB（未压缩） | 手机首开和弱网需要单独预算 |
| 未使用大资源 | `coming-soon.png ≈ 2.4MB` | 若被未来页面误引用会明显拖慢移动首屏 |

这不要求立刻重写成 React。最小正确方向是：保留原生 SPA 和现有后端，先建立“共享状态/动作 → 页面
presentation model → PC/手机布局”的清晰边界，再逐页迁移。

## 8. 四游戏接入前必须先关闭的缺口

### Blocking

1. 建立浏览器可读的安全游戏目录，消除服务端 registry 与 `public/js/data.js` 双事实源；
2. 去除 Matching status、row type、Profile、Room label 和 capacity runner 中的 Deadlock 硬编码；
3. 明确每款游戏自己的 Ranked/Casual 支持、hard max、段位、位置、硬规则和软偏好；
4. 为三款新游戏添加正式 rule set 与 forward-only 数据支持；
5. 让 Room、Session、赛后、最近连接与个人资料按 `gameId` 展示，不串游戏；
6. 让单游戏 correctness smoke 和最终容量 runner 能按 game definition 生成 workload。

### Non-blocking / 可逐步收敛

- 退役 Matching/Friends 页面物理删除；
- OPS V1 endpoint 退休；
- CSS 文件按页面或职责拆分；
- Google Fonts 自托管；
- 删除未引用资源。

这些整理不能先于行为测试和调用观测，也不能改动历史 migration。

## 9. Phase 0 结论

```text
CANONICAL / PRODUCTION ALIGNMENT: PARTIAL PASS
  - Git 与公开 runtime 可核对
  - 容器内部证据本轮缺失

CURRENT PRODUCT: DEADLOCK-ONLY / PC-ONLY

GAME EXTENSION FOUNDATION: PARTIAL READY
  - Registry/adapter/shared lifecycle 已有
  - Browser/catalog/status/profile/runner 未贯通

MOBILE PRODUCT: NOT IMPLEMENTED
  - 当前由 PC-only Gate 主动阻断

RETIRED PATHS IDENTIFIED: YES

PHASE 1 DESIGN CAN START: YES
```

推荐下一步不是立刻接无畏契约素材，而是先完成 Phase 1：统一游戏展示目录、手机外壳、手机 Room 和恢复交互
基础；随后无畏契约成为第一个真实验证该边界的新游戏。
