# PROJECT-S / “机”缘 — Project Handoff

> 交接对象：没有参与过历史对话的新 AI / 工程师  
> 生成日期：2026-08-20（Asia/Shanghai）  
> 事实优先级：**当前代码 > 当前数据库迁移与配置 > 已确认需求 > 历史讨论/视觉稿 > 推测**  
> 当前仓库：`/Users/jasonhu/Documents/Codex/2026-08-15/project-s-product-specification-v0-1-2/work/project-s-source`  
> 当前分支：`agent/ui-shell-production`，HEAD：`7bee0a2 refine medium viewport card layout`  

这是一份工程交接文档，不是聊天记录。文中状态使用以下含义：

- **已实现**：当前代码明确存在，并有代码/测试证据。
- **部分实现**：主路径存在，但至少有缺口、兼容层或未覆盖场景。
- **已决定但未实现**：需求或架构已确定，当前代码尚未完成。
- **已废弃**：历史方案仍可能留在迁移、README 或旧代码中，但不应再作为新功能基础。
- **已确认 Bug**：从当前代码/迁移/测试可以直接证明存在；仍需线上复现的会另外标注。
- **风险（未确认 Bug）**：合理怀疑，需要真实环境或故障注入确认。
- **需要重新验证**：本次扫描无法从代码静态确定，不能把它写成事实。

---

## 1. PROJECT OVERVIEW

### 1.1 项目是什么

“机”缘（历史仓库/文档仍使用 PROJECT-S）是一个面向 PC 游戏玩家的实时找队友 Web MVP。核心承诺是：用户选游戏和匹配条件，系统找到真实玩家，双方在机缘房间内交换游戏联系方式并开始游玩，结束后完成反馈，并沉淀为最近连接。

当前 Deadlock MVP 是唯一应视为正式匹配规则的游戏；王者荣耀、无畏契约、我的世界等曾出现在产品/视觉需求或旧种子数据中，当前前端部分隐藏或显示 Coming Soon，不能据此认为已支持匹配。

### 1.2 当前阶段

- 产品阶段：公网验证阶段的 MVP，核心目标是验证“注册 → 配置 → 实时匹配 → 房间 → Session 结束 → 反馈/最近连接”闭环。
- 当前开发阶段：稳定性、状态机、数据一致性和运营可观测性优先；不应继续扩展 UI 或新游戏，除非用户明确授权。
- 正式入口（部署文档）：`https://jiyuan.online`。
- Vercel 备用入口（部署文档）：`https://project-s-iota.vercel.app`。
- 香港部署节点：腾讯云中国香港，部署文档中的 IP 为 `124.156.175.247`。公网线上代码是否与当前工作树一致，需要重新验证。

### 1.3 技术栈

- Next.js 15 App Router，仅用于服务端页面、API 和 `/ops`；主用户界面是 `public/index.html` + 原生 ES modules，而不是 React 页面组件。
- React 19 + TypeScript 5.7（主要用于 Next `/ops` 与服务端代码）。
- Supabase：PostgreSQL、Auth、Realtime、RLS。
- GSAP：前端动效和实时匹配/光标视觉效果。
- Vitest：单元/契约测试；Playwright：E2E。
- Docker + Caddy：中国香港生产部署、HTTPS 和 Supabase 同域代理。
- Vercel：备用发布/回滚入口。

### 1.4 本地运行

```bash
cd /Users/jasonhu/Documents/Codex/2026-08-15/project-s-product-specification-v0-1-2/work/project-s-source
pnpm install
cp .env.example .env.local
# 填写环境变量后：
pnpm dev       # http://localhost:3000
```

生产构建与启动：

```bash
pnpm build
pnpm start
```

---

## 2. CURRENT PRODUCT LOGIC

以下描述以当前代码为准，旧 README 中的“申请一起玩”流程已被新的实时匹配状态机替代，不能继续照抄旧文案。

### 2.1 入口与认证

1. `/` 的 Next 页面重定向到 `/index.html`。
2. `public/index.html` 读取 hash 路由；无 hash 时默认进入 `hero`。
3. Hero 页展示品牌、中文/英文 slogan、在线/匹配公开目录、开始匹配、登录/注册和联系我们入口。公开目录由服务端掩码昵称，只展示有限的匹配配置。
4. 用户使用用户名 + 密码注册或登录。服务端把用户名规范化为私有合成邮箱，再调用 Supabase Auth。
5. 注册/登录成功后，若无 `profiles`，进入创建玩家身份；已有 profile 则恢复到应用壳层。

### 2.2 创建玩家身份

当前 profile 需要至少有昵称；页面还承载头像、性别、设备、常玩游戏类型等字段。头像可以是 `avatar_key` 或前端 Data URL。配置通过 `POST /api/profile` 更新，服务端使用 Service Role 写 `profiles` / `user_games`。

这部分是**部分实现**：历史需求要求所有步骤平滑、可逐步恢复、图片空位可后续替换；当前代码有表字段和 UI，但完整的异常恢复、上传大小限制和跨设备继续编辑需要重新验证。

### 2.3 进入摇人 / 配置

1. 用户进入 `home` / 摇人页面。
2. 当前正式可用游戏应视为 Deadlock；其他游戏数据仍在 `games` 表，前端多数隐藏或显示 Coming Soon。
3. Deadlock 模式：
   - `ranked`：天梯/冲分，当前迁移明确为双排，单次只再匹配 1 人。
   - `casual`：休闲，可选择目标队友数量 1–5，允许在达到最小人数后由房主“人数差不多，开始”。
4. 其他条件：段位、希望位置（1–6）、麦克风偏好。位置和麦克风属于软偏好；游戏、模式、天梯硬规则属于硬约束。
5. 页面按步骤展示配置，提交后调用 `POST /api/matchmaking/start`；休闲组会创建/加入 group，并在需要时调用 `POST /api/matchmaking/group/start`。

### 2.4 匹配生命周期

#### 天梯双人

```text
idle
  -> searching
  -> candidate_found
  -> waiting_confirmation
  -> matched / playing（当前 pair RPC 会直接推进到 playing）
  -> completed 或 cancelled / expired
```

- 起点是 `matchmaking_tickets`。
- 后端先执行硬规则，再按照软偏好评分候选。
- 匹配候选通过 pair + confirmations 给双方展示。
- 双方确认是独立操作；一方确认后另一方应看到“对方已确认”，不需要同时点击。
- 最新配对迁移在双方接受后创建 `rooms` / `sessions` 并进入 `playing`。状态名仍存在 `matched`，但 pair 路径实际可能跳过它，见已知问题。

#### 休闲多人

```text
searching
  -> partial_ready
  -> waiting_confirmation
  -> matched（创建 room/session，session 当前为 ready）
  -> playing（当前缺少可靠推进路径）
  -> completed / cancelled / expired
```

- 房主可以设置想找几位以及最低可开始人数。
- 候选进入 `matchmaking_groups` / `matchmaking_group_members`。
- 达到最低人数后，房主可以停止继续等待并开始确认。
- 所有人确认后，`0016_casual_group_matchmaking.sql` 创建 `rooms(status='ready')` 和 `sessions(status='ready')`，把 group/tickets 标记为 `matched`。
- 当前房间 UI 没有独立“开始游戏”按钮，且后端没有 `/api/room/[code]/start`，因此多人休闲完整进入 playing/拜拜/结算的闭环**没有证实完成**，是 P1 核心缺陷。

### 2.5 房间与游玩

- 房间页面读取 `GET /api/state` / Realtime snapshot，展示成员、聊天、游戏账号交换、机缘好友申请和“拜拜”。
- 用户可发送房间消息；数据库 `messages.content` 目前最大 2000 字，后续迁移意图改为 500 字，但迁移实现存在约束一致性风险。
- Pair 房间在双方确认后应自动进入 playing；当前 UI不再提供旧的“开始游戏”按钮。
- `goodbye` 调用 `phase1_request_goodbye`；正常设计是双方都提出/确认后结束，单方主动退出要进入异常退出/不计正常对局路径。

### 2.6 结束、反馈与关系沉淀

- Session 结束后进入 `gameover`。
- 用户提交体验评分、点赞/标签等，写 `session_responses` 或 `matchmaking_feedback`。
- 完成 RPC 会生成 `recent_connections`，按 session + user + friend 去重；`me` 页面聚合最近连接。
- 好友系统的 UI 已被多次决定暂时关闭，部分页面显示 Coming Soon，但 `friends/search|add|respond` API 和表仍然存在；它是**部分实现/未彻底退役**，不能默认可用。

---

## 3. SYSTEM ARCHITECTURE

```text
浏览器（public/index.html + public/js）
  ├─ hash 路由 / 本地持久化 / 页面状态
  ├─ fetch /api/* + Supabase Realtime 浏览器客户端
  └─ 仅展示服务端 DTO，不应直接读取他人私密字段
          ↓
Next.js App Router
  ├─ src/app/api/*：认证、状态、匹配、房间、反馈、运营
  ├─ src/lib/auth.ts：Bearer/session/profile 鉴权
  ├─ src/lib/http.ts：AppError、requestId、幂等 header
  ├─ src/lib/matchmaking/*：规则、服务、状态机、类型
  └─ src/lib/api.ts：服务端聚合查询和公共目录
          ↓ Service Role / RPC
Supabase PostgreSQL + Auth + Realtime + RLS
```

### 3.1 前端

- 主用户应用不是 `src/app/page.tsx` 的 React UI；`src/app/page.tsx` 只 `redirect('/index.html')`。
- `public/js/app.js` 是集中式应用编排器：初始化、路由、状态恢复、事件绑定、轮询、Realtime patch、beforeunload/pagehide。
- 页面渲染函数位于 `public/js/pages/*.js`，共享壳层和控件位于 `public/js/ui.js`、`field.js`、`icons.js`、`transition.js`。
- `public/styles/product-shell.css` 负责视觉系统、侧边栏、底部无限 loop、响应式和动效。

### 3.2 后端

- Next API route 处理输入校验、鉴权、Service Role 查询和 RPC 调用。
- 业务写入优先通过 Supabase RPC，以数据库事务和 `FOR UPDATE SKIP LOCKED` 保证匹配保留/确认的原子性。
- `src/lib/api.ts` 负责把 profile、房间、session、目录、最近连接聚合为前端 DTO。

### 3.3 Authentication / Authorization

- Supabase Auth 保存真正的 auth user。
- 应用 profile 使用 `profiles.auth_user_id` 关联。
- 服务端从 `Authorization: Bearer <token>` 取 token；历史兼容层还允许部分 POST 把 token 放 body，应该逐步删除。
- `SUPABASE_SERVICE_ROLE_KEY` 只允许服务端使用，不能下发浏览器。

### 3.4 Realtime

`public/js/realtime.js` 订阅 matchmaking tickets/pairs/confirmations/groups/group_members、rooms、sessions、goodbye、friendships、room_members 的 Postgres changes；收到事件后 debounce，调用 `GET /api/state` 更新前端。无 Supabase 客户端时退化为 4 秒 snapshot 轮询。当前没有可靠的 subscribe status、自动重连或断线显式状态。

### 3.5 部署

- Vercel：Next.js 备用发布。
- 中国香港：Docker Compose 运行 Next standalone，Caddy 对外提供 HTTPS 并代理 Supabase Auth/REST/Storage/Realtime；生产副本位于服务器 `/opt/jiyuan`。
- Supabase 数据不随应用容器迁移；发布前必须确保目标项目迁移顺序和环境变量正确。
- 生产发布前必须先登录腾讯云控制台，并通过 OrcaTerm / 服务器终端执行 `/opt/jiyuan/deploy/china-hk/deploy.sh`；本地 AI 执行环境可能没有服务器 SSH 私钥。
- OrcaTerm 登录输出中的二维码是服务器登录/状态提示，不是应用部署结果；部署是否成功以 Docker `app`/`gateway` healthy 和 `/api/health` 返回 `ok=true`、`status=ready` 为准。
- 数据库 migration 与网站代码发布分开确认；migration 已执行后不要因为终端二维码或输出不完整而盲目重复 migration。

---

## 4. PROJECT DIRECTORY

```text
project-s-source/
├── public/
│   ├── index.html                 # 主用户入口；默认 hash=hero
│   ├── js/
│   │   ├── app.js                 # 核心编排、路由、全局状态、事件与同步
│   │   ├── api.js                 # 浏览器 API 客户端、Supabase session
│   │   ├── realtime.js            # Realtime / 轮询 fallback
│   │   ├── store.js               # 本地状态/持久化
│   │   ├── ui.js                  # 应用壳层、侧栏、ticker、共用控件
│   │   ├── data.js/avatar.js      # 前端展示数据与头像
│   │   ├── field.js/icons.js      # 表单字段、图标
│   │   ├── transition.js          # 页面转场
│   │   ├── hero-waves.js          # Hero 动态背景
│   │   └── pages/*.js             # hero/home/auth/welcome/matching/room/gameover/community/me/friends/connections
│   ├── styles/                    # 主用户 CSS（product-shell.css 等）
│   └── assets/                    # logo、游戏图、段位图、coming-soon 等
├── src/app/
│   ├── page.tsx                  # 仅重定向到 /index.html
│   ├── layout.tsx                # metadata、favicon、全局 CSS
│   ├── ops/page.tsx              # React 运营看板，30 秒刷新
│   └── api/                      # 所有 Next API route
├── src/lib/
│   ├── api.ts                    # 服务端聚合查询/DTO
│   ├── auth.ts/http.ts           # 鉴权与错误/幂等
│   ├── matchmaking/              # 规则、服务、状态机、类型、测试
│   ├── session*.ts               # session/goodbye 生命周期
│   ├── friendships*.ts            # 好友相关服务/测试
│   ├── metrics.ts/feedback.ts    # 指标、反馈
│   ├── ops.ts                    # OPS 密码、cookie/session
│   ├── data.ts/types.ts           # Supabase 数据映射与共享类型
│   └── supabase.ts               # Supabase client
├── supabase/migrations/           # 当前真实 schema，必须完整按文件顺序检查
├── tests/                         # DB/服务契约测试、E2E
├── docs/                          # 部署、P1 运营、人工 QA
├── deploy/china-hk/               # Docker/Caddy/监控/香港生产部署
├── scripts/                       # 公网检查、旧数据审计/清理 SQL
├── package.json / pnpm-lock.yaml
└── next.config.mjs / tsconfig.json / playwright.config.ts
```

### 4.1 核心文件与高风险文件

- 高耦合：`public/js/app.js`、`public/js/ui.js`、`public/styles/product-shell.css`。
- 状态机核心：`src/lib/matchmaking/state-machine.ts`、`service.ts`、`rules.ts` 及 `supabase/migrations/0009*`、`0016*`。
- 数据库真实事实：`supabase/migrations/*.sql`，不要只看 README 的旧迁移列表。
- 历史遗留：`match_requests`、`matches`、`applications` 及旧 `phase1_*` RPC 仍在数据库；不能直接删表，需先确认线上数据/调用方。

---

## 5. DATABASE

### 5.1 当前迁移

迁移目录包含：

```text
0001_init.sql
0002_profiles_gender.sql
0003_profiles_genres.sql
0004_deadlock_genshin_match_details.sql
0005_room_lifecycle.sql
0006_phase1_mvp_closure.sql
0007_profiles_age_range.sql
0008_restrict_auth_helpers.sql
0009_realtime_matchmaking.sql
0010_matchmaking_exit_recovery.sql
0011_normal_and_abnormal_session_end.sql
0012_restrict_internal_matchmaking_functions.sql
0013_p1_operations.sql
0014_ops_dashboard.sql
0015_ops_credentials.sql
0016_casual_group_matchmaking.sql
20260818173534_mutual_goodbye_and_friend_requests.sql
20260819193000_feedback_limit.sql
20260820100000_deadlock_ranked_duo_only.sql
```

README/部署文档仍主要列到 `0008`，这与代码真实迁移状态不一致；新 AI 必须先对照 Supabase 实际已应用迁移，再决定是否补跑文件。

### 5.2 表与字段

| 表 | 主要字段/关系 | 用途与注意事项 |
|---|---|---|
| `games` | `id` PK、`name`、`tag`、`modes`/`roles`/`devices` JSONB、`enabled`、`created_at` | 游戏目录；旧种子包含 minecraft/stardew/pubg/valorant/hok/league，当前 Deadlock 前端主路径只使用/展示 Deadlock。 |
| `profiles` | `id` PK、`auth_user_id` unique FK `auth.users`、`nickname`、`avatar_key`、`device`、`gender`、`play_style`、`voice`、`online`、`last_seen`、`friend_code` unique、`created_at`；后续有 `genres`、`age_range`、`game_accounts` | 用户身份与在线状态。服务端公开 DTO 应隐藏 friend_code/game_accounts，房间成员例外。 |
| `user_games` | `id`、`user_id` FK、`game_id` FK、`role`、`level`、`win_rate`、`note`、`created_at` | 用户游戏画像；旧 RLS 对 authenticated 读过宽。 |
| `match_requests` | user/game FK、activity/goal/player count/play_time/duration/voice/desired type、`status`、`expires_at` | **旧匹配模型**；新 ticket 状态机不应再写它，但旧 RPC/RLS 仍存在。 |
| `matches` | 两个 `match_requests` FK、`status` | **旧双人申请模型**；与新 `matchmaking_pairs` 重复。 |
| `applications` | from/to profile FK、旧 match_request FK、`status`、`created_at` | **旧申请一起玩模型**；当前主 UI 不应重新启用。 |
| `rooms` | `id`、`code` unique、旧 `application_id`、`need` JSONB、`status` connecting/ready/playing/finished、`started_at`、后续 completed/exit 字段 | 临时房间。多人 group 当前创建 ready 房间。 |
| `room_members` | room/user FK、`joined_at`、后续 `status`、`exited_at` | 成员与退出状态；`unique(room_id,user_id)`。 |
| `messages` | room/sender FK、`content` 1–2000、`created_at`、room/time index | 房间文字聊天；内容上限迁移与前端限制需重新核对。 |
| `sessions` | `id`、`room_code`、`room_id`、`players`/`need` JSONB、`outcome_by`/`rematch_by`、`status`、`started_at`/`ended_at`、完成/取消来源、`version` | Session 生命周期。旧 `active/completed` 已扩展为 ready/playing/completed/cancelled，实际约束需以所有迁移合并结果为准。 |
| `session_responses` | session/user FK、`rating`、`want_again`、`rematch_choice`、时间字段；unique(session,user) | 结束后评价。 |
| `recent_connections` | user/friend/game/room/session FK、`played_at`、`play_count`、`rating`、`want_again`、`created_at`；session/user/friend unique index | 正常完成后关系沉淀；服务端按 friend 聚合。 |
| `friendships` | user/friend FK、`status` pending/accepted/blocked、`created_at`、方向 unique | 好友关系；UI 当前被决定暂时 Coming Soon，但 API/表仍在。 |
| `feedback` | user、username/email、`feedback_type`、`content`、contact/page/game/match request、UA、时间、email status/error、request unique | 联系我们/用户反馈；当前写入 OPS 收件箱，README 的 Resend 描述已过时。 |
| `product_events` | event、user/session/room/request FK、`request_id`、properties JSONB、occurred_at；request+event unique | 指标与错误事件；客户端不可直接写。 |
| `matchmaking_rule_sets` | game、version、active、`hard_rules`/`soft_preferences`/`wait_strategy` JSONB、notes、时间 | 可调整规则配置；不把权重写死在 UI。 |
| `matchmaking_tickets` | user/game/mode、rank、desired_roles、mic、search_started/heartbeat/expires、state、pair/group/room/session refs、confirmation/matched/playing/closed 时间、cancel reason、rule_set、metadata、version、后续 desired/min teammates | 新统一匹配池；user active unique、request idempotency unique、多组索引。 |
| `matchmaking_pairs` | user/ticket A/B、state、room/session、confirmation deadline、matched/updated/version | Deadlock 天梯双人配对。 |
| `matchmaking_confirmations` | pair/user、decision、responded_at、时间；pair/user unique | 双方独立确认。 |
| `matchmaking_feedback` | pair/user、did_play、rating、want_again、tags、note ≤500、时间；pair/user unique | 新匹配反馈。 |
| `matchmaking_state_events` | ticket/pair/actor、from/to/reason/request_id、metadata、occurred_at | 状态转换审计日志。 |
| `session_goodbye_requests` | session/user、requested/updated 时间；session/user unique | 房间“拜拜”意图；只允许 session member 读。 |
| `matchmaking_groups` | owner、game、mode=casual、state、desired/min teammates 1–5、rule set、deadline、room/session refs、时间、cancel/version | 休闲多人组。 |
| `matchmaking_group_members` | group/ticket/user、is_owner、decision pending/accepted/rejected、join/respond/update 时间；group/user、ticket unique | 休闲组成员。 |
| `ops_credentials` | 固定 id `primary`、password salt/hash、session_version、updated_at | OPS 密码凭据；RLS/private，运营 cookie 12 小时。 |

### 5.3 RLS 现状

- 新匹配表：浏览器主要只能读取自己的 ticket/pair/confirmation/feedback；写入和关键 RPC 仅 Service Role。
- profiles：`0006` 收紧为只能读取自己的 profile；他人信息由服务端 DTO 输出。
- 房间/Session/消息/好友/结束请求：按成员/参与者/双方限制。
- **已确认安全风险**：`match_requests`、`user_games` 的旧 authenticated select policy 仍然是全体可读；`applications_update_involved` 允许任一参与方更新整行，包含 from/to/status 的潜在篡改面。新代码没有调用不等于 PostgREST 暴露已经消失。
- `product_events` 和运营数据应只能由 Service Role/OPS 读取。

---

## 6. API

所有受保护 API 默认使用 Bearer token，部分 POST 兼容 body token。API 错误由 `src/lib/http.ts` 转换为带 `requestId` 的 JSON；数据库异常不应直接泄露 SQL/Service Role 信息。

| 方法 | 路径 | 用途 | 权限/数据库影响 |
|---|---|---|---|
| `POST` | `/api/auth/login` | 用户名密码登录 | 公共；Supabase signInWithPassword，返回 session。 |
| `POST` | `/api/auth/register` | 创建用户名密码账号 | 公共；校验用户名/密码，Admin create user，email_confirm。 |
| `GET` | `/api/config` | 返回浏览器可用 Supabase URL/anon key | 公共；不得返回 service role。 |
| `POST` | `/api/register` | 绑定/恢复 profile | 需 Auth；创建或更新 `profiles`，设置 online。 |
| `POST` | `/api/profile` | 更新昵称、头像、性别、设备、游戏画像 | 需 Auth；服务端写 profile/user_games。 |
| `GET` | `/api/session` | 读取当前 Supabase/应用 session | Auth 相关；用于恢复。 |
| `GET` | `/api/state` | 聚合当前 profile、匹配、房间、session | 需 Auth；调用 matchmaking 状态和 active room/session。 |
| `POST` | `/api/online` | pageshow/进入页面标记在线 | 需 Auth；更新 profile.online/last_seen。 |
| `POST` | `/api/offline` | unload/pagehide 标记离线并取消匹配 ticket | 需 Auth；依赖浏览器成功送达，异常关闭不可靠。 |
| `GET` | `/api/health` | 公网健康/在线/匹配/游玩/目录 | 公共；读取 counts，存在隐私与滥用面。 |
| `POST` | `/api/matchmaking/start` | 启动或恢复 Deadlock ticket | 需 Auth；规范条件、RPC 创建 ticket、尝试匹配。 |
| `GET` | `/api/matchmaking/status` | 查询 ticket/pair/group/candidate/directory | 需 Auth；可触发过期/匹配维护。 |
| `POST` | `/api/matchmaking/cancel` | 取消当前匹配 | 需 Auth；RPC 取消/释放候选。 |
| `POST` | `/api/matchmaking/confirm` | pair 接受/拒绝 | 需 Auth；RPC 原子更新双方确认/创建房间。 |
| `POST` | `/api/matchmaking/group/start` | 房主达到最低人数后停止等待并发起 group 确认 | 需 Auth + owner；更新 group/ticket 状态。 |
| `POST` | `/api/matchmaking/feedback` | 新 pair 反馈 | 需 Auth；写 matchmaking_feedback。 |
| `POST` | `/api/room/[code]/exit` | 房间/Session 异常退出 | 需 Auth + 成员；RPC `phase1_exit_room`，更新 room/member/session。 |
| `POST` | `/api/room/[code]/goodbye` | 正常结束请求/撤回 | 需 Auth + 成员；RPC `phase1_request_goodbye`。多人 ready session 当前可能被拒绝。 |
| `POST` | `/api/room/[code]/feedback` | 结束后的 rating/点赞/体验 | 需 Auth + 成员；写 session_responses 或 matchmaking_feedback。 |
| `POST` | `/api/feedback` | 联系我们 | 需 Auth；写 feedback，OPS 直接读取。 |
| `POST` | `/api/events` | 客户端错误/产品事件 | 需 Auth；服务端过滤后写 product_events。 |
| `POST` | `/api/friends/search` | friend_code 搜索 | 需 Auth；读取目标 profile DTO。当前 UI 计划 Coming Soon。 |
| `POST` | `/api/friends/add` | 申请机缘好友 | 需 Auth；RPC `phase1_request_friendship`。 |
| `POST` | `/api/friends/respond` | 接受/拒绝好友 | 需 Auth；RPC `phase1_respond_friendship`。 |
| `POST` | `/api/ops/session` | OPS 密码登录 | 公共入口但应限速；设置 HttpOnly cookie。 |
| `DELETE` | `/api/ops/session` | OPS 登出 | 清除运营 cookie。 |
| `POST` | `/api/ops/password` | OPS 修改密码 | OPS session/环境权限；更新 `ops_credentials`，递增 session_version。 |
| `GET` | `/api/ops/metrics` | 漏斗、趋势、错误、反馈 | OPS bearer 或 cookie；读取 RPC/事件/feedback。 |

### 6.1 API 不一致/缺口

- 当前没有 `/api/room/[code]/start`。这不是遗漏的普通按钮，而是休闲 group 创建 `ready` session 后没有推进 `playing` 的核心缺口。
- 旧 `/api/register` 与新 `/api/auth/register` 都存在；前者是 profile 绑定/恢复，命名容易造成误用。
- 旧 `phase1_*` RPC 与新 matchmaking RPC 并存；新 AI 修改前必须确认调用方和迁移版本。
- README 描述的“Resend 反馈邮件”与当前 `/ops` 直接收件箱实现不一致。

---

## 7. AUTH & PERMISSIONS

### 7.1 登录方式

- 用户登录：用户名 + 密码。
- Supabase 内部使用合成邮箱，不要求真实邮箱验证。
- 浏览器 session 由 Supabase client 持久化；服务端 API 依据 Bearer token 获取 auth user 和 profile。

### 7.2 受保护范围

- profile、state、online/offline、matchmaking、room、feedback、friends、events 均需要登录。
- `/api/config`、`/api/health`、登录/注册和 OPS 登录入口公共可达。
- `/ops` 页面本身可打开，但指标接口和密码修改需 OPS session/token。

### 7.3 权限问题

1. **P1，已确认策略风险**：旧 `match_requests` / `user_games` 全体 authenticated 可读；如果仍能用 anon client/PostgREST 直连，用户可读到不应暴露的历史匹配/游戏画像。
2. **P1，已确认策略风险**：`applications_update_involved` 的 `WITH CHECK` 只验证“仍是参与者”，未限制可改字段，可能篡改对方/状态。
3. **P1，风险**：OPS 密码登录没有失败次数限制、IP/账户限速或锁定机制，存在暴力破解面。
4. **P2，兼容性风险**：body token fallback 会增加日志/代理泄漏可能，应在一个版本后移除。
5. **P2，隐私风险**：公共 `/api/health` 公开在线/匹配人数和匿名目录；这是产品明确使用的 Hero 数据，但需要限流和数据最小化。

---

## 8. CORE STATE MACHINES

### 8.1 Pair ticket / pair

| 当前状态 | 可进入 | 触发 |
|---|---|---|
| `idle` | `searching` | start ticket |
| `searching` | `candidate_found`、`cancelled`、`expired` | 保留候选、取消、过期 |
| `candidate_found` | `waiting_confirmation`、`cancelled`、`expired` | present pair / reject / timeout |
| `waiting_confirmation` | `matched`、`playing`、`cancelled`、`expired` | 双方确认、当前 pair RPC 建房、拒绝/超时 |
| `matched` | `playing`、`cancelled` | 设计允许，但当前 pair 实现可能直接跳过 |
| `playing` | `completed`、`cancelled` | 双方正常结束或异常退出 |
| `completed/cancelled/expired` | `idle`（新 ticket） | 新一轮匹配 |

禁止：同一 user 存在多个 active ticket；已 `matched/playing` 的 ticket 重新进入 pool；拒绝者在 cooldown/有效期内立刻再次匹配同一 pair。实际拒绝 cooldown 是否覆盖所有路径，需要重新验证。

### 8.2 Casual group

```text
searching -> partial_ready -> waiting_confirmation -> matched -> playing -> completed
       \-> cancelled / expired       \-> rejected后退回 partial_ready
```

- 房主可在达到 `min_teammates` 后调用 group/start。
- 成员拒绝会从 group 移除，其 ticket 重新 searching；其他成员回到 partial_ready。
- 所有人接受后当前 DB 只创建 `ready` room/session 并标记 matched；没有确认的 playing transition caller。

### 8.3 Room / member

```text
room connecting -> ready -> playing -> finished
                         \-> finished/exit
member active -> exited
```

- 房间只允许成员读写消息、游戏账号和结束动作。
- active room 查询只看 `room_members.status='active'` + room status connecting/ready/playing。
- 历史 completed session 不应作为当前 active session；当前 `activeSessionFor` 没有排除 completed，见 Bug。

### 8.4 Session

```text
ready -> playing -> completed
  \-> cancelled（异常退出）
```

- 正常 goodbye 应双向确认后完成，并写 `session_responses`/`recent_connections`。
- 单方退出应进入异常退出，不计正常对局；具体 UI 与 DB 状态要以 RPC 复核。
- group ready session 无可靠 start，导致 goodbye 可能被 `SESSION_NOT_PLAYING` 拒绝。

### 8.5 Goodbye

```text
playing + no request -> request by A/B
request by one -> waiting for other / other can respond
request by both -> completed + gameover
playing + exit -> cancelled/abnormal
```

撤回、对方已请求时回应、同时请求、重复请求必须保持幂等；Realtime 断开时不能以旧 UI 假装成功。

### 8.6 Presence

```text
offline -> pageshow/online API -> online
online -> pagehide/beforeunload/offline API -> offline
```

当前取消 heartbeat，产品决定“页面打开就在线”。浏览器崩溃、强制关闭、断网、进程被杀时不保证 offline 事件送达；没有 TTL 兜底，因此这是未确认但高风险的幽灵在线状态来源。

### 8.7 Friends / invitations

```text
no relation -> pending -> accepted
                    \-> declined
accepted -> blocked/delete（取决于 RPC）
```

UI 当前计划 `Coming Soon`，但 API/表保留。不要把“API 存在”写成“好友功能已上线”。

---

## 9. FRONTEND PAGES

| 页面/route | 用途与入口 | 主要状态/API | 去向 | 当前状态 |
|---|---|---|---|---|
| `hero` | 根入口、公共说明、人数、匿名匹配目录、开始匹配/登录/联系我们 | `/api/health`，hero polling 约 30s；账号状态 | `auth`、`home`、联系我们登录 | 🟡 UI 已有；线上/工作树版本需重新验证 |
| `auth` | 登录/注册 | `/api/auth/login`、`/api/auth/register` | `welcome` 或 `home` | ✅ 主路径存在；错误/恢复需实测 |
| `welcome` | 创建/编辑玩家身份 | `/api/profile`、`/api/register` | `home` | 🟡 字段和步进 UI 存在；异常恢复需验证 |
| `home` | 选择 Deadlock、冲分/休闲、段位、位置、麦克风、人数；右侧小匹配广场 | `/api/state`、`/api/matchmaking/start`、group/start、health | `matching` | 🟡 天梯/休闲路径不同，旧游戏仍有数据残留 |
| `matching` | 候选、确认、取消、多人房主早开 | status/confirm/cancel/group/start，3s polling + Realtime | `room`、`home` | 🟡 pair 较完整；group 后续缺口 |
| `room` | 文字聊天、交换游戏账号、机缘好友申请、拜拜/退出 | `/api/state`、room exit/goodbye/feedback、Realtime | `gameover`、`home` | 🟡 pair 主路径；多人 ready/play 状态有 P1 问题 |
| `gameover` | 点赞/体验、加好友（当前可能 Coming Soon） | room feedback / matchmaking feedback | `connections`、`home` | 🟡 结算数据链路存在，UI 开关与好友 API 冲突 |
| `community` | 占位 | 无核心 API | 返回当前 shell | 🔴 Coming Soon |
| `me` | 我的资料、最近连接、好友/连接占位 | `/api/state`/最近连接 | shell 内导航 | 🟡 最近连接存在；好友关闭 |
| `friends` | 历史好友系统页面 | friends API | shell 内导航 | 🔴/🟡 已决定暂时关闭，需清理入口而非继续扩展 |
| `connections` | 最近一起玩的人 | `/api/state` / `recentConnectionsFor` | room/首页 | 🟡 依赖正常 Session 结算 |
| `/ops` | 运营指标、错误、反馈、健康状态、密码修改 | `/api/ops/session`、`/api/ops/metrics`、`/api/health`、password | 无 | ✅ 结构存在，安全限速仍缺 |

### 9.1 UI 特别注意

- 左导航在 hover 时展开，离开收起；点击导航不应触发旧页面 reload 或紫色滑出闪烁。
- 房间内导航逻辑应锁定在房间，不允许点击 `me/home` 把用户带出 active room。
- hero / home 的底部 warning tape 必须是无缝循环；历史视觉修改多，不能用截图判断业务完成度。

---

## 10. COMPONENT SYSTEM

项目没有完整 shadcn/React 组件树；主 UI 是原生 DOM 模板函数。共享层主要是：

- `homeShell`：侧栏、logo、账户、ticker、PC gate、导航。
- `button()` / `card()` / `field()` / `icon()` 等模板工具。
- 页面级模板：`homeFlowStepper`、matching modal/group、room panels、gameover feedback。
- `avatarWrap`：头像和在线状态。
- `transition.js` / GSAP：转场、加载、目标光标和 hover 动效。

技术债：

- `public/js/app.js` 集中承担路由、渲染、持久化、事件和网络同步，改动容易影响所有页面。
- 页面状态和 DOM selector 依赖隐式约定，没有统一 schema/类型。
- 旧好友/申请/旧匹配模板可能继续存在，需通过 `rg` 查找真实引用后再删除。
- 不要因为用户曾提供 React Bits 组件，就直接把当前项目改成 shadcn/Tailwind；当前仓库并非那种结构，除非另开重构任务。

---

## 11. REALTIME / CONCURRENCY

### 11.1 当前实现

- 新匹配操作由 RPC / 数据库事务做原子状态变更。
- pair/group 以 user active unique、version、request id、confirmation deadline 等字段防重复。
- 前端 Realtime 事件只触发一次 snapshot refresh，部分匹配路径额外 3 秒轮询。
- 无 Supabase 时 realtime fallback 是 4 秒 `/api/state` 轮询。

### 11.2 已确认/待验证的并发问题

- **已确认设计缺口（P1）**：group all-confirm 后没有 ready→playing 的服务路径。
- **已确认架构风险（P1）**：`realtime.js` 没有处理 channel subscribe status、断线、重连/指数退避；房间账号/拜拜/聊天等依赖 Realtime 时可能停在旧状态。
- **风险（未确认）**：双标签页同一用户并发 start，虽有 active unique，但前端可能同时显示两个 loading；需要双标签实测。
- **风险（未确认）**：同时 confirm/reject/cancel 依赖 RPC 版本和 deadline；需用两个真实账号和并发请求验证，不要只测 UI。
- **风险（未确认）**：房间成员一方退出后另一方的 snapshot、导航和 `activeSessionFor` 可能恢复旧 gameover。
- **风险（未确认）**：离线/断网时 front 仍保留 online/matching UI，服务端 ticket 过期/取消与浏览器状态可能不同步。

### 11.3 必测并发矩阵

1. 两人同时 start；同一请求重复 10 次。
2. A confirm、B reject 同时发出。
3. A/B 同时 confirm。
4. 房主 group/start 与候选 join 同时发生。
5. 一方 pagehide/断网与另一方 confirm 同时发生。
6. 组内 2、3、4、5 名同时确认；一人拒绝、超时、掉线。
7. 两个标签页同时 cancel/room goodbye。

---

## 12. ERROR HANDLING

### 已存在

- `AppError`/HTTP 映射和 requestId。
- API 统一 JSON error；前端多数请求在 `api.js` 处理失败。
- 匹配 deadline/过期/拒绝有数据库异常码和状态事件。
- OPS dashboard 读取 client/server errors，服务端 5xx 写 `product_events`。
- 联系我们写 DB，不依赖邮件服务。

### 不足

- Realtime subscribe 失败/断开没有显式 UI 状态和重连。
- 浏览器 pagehide/offline 送达失败没有服务端 TTL 清理。
- `activeSessionFor` 可能把 completed session 当当前 session。
- 多人 group ready session 的 goodbye 错误没有产品级恢复。
- 旧迁移字段/约束和前端输入上限可能不一致；需在目标 Supabase 实例执行 schema introspection。
- OPS 登录没有 rate limit / lockout。
- 许多前端 `catch` 只静默忽略，用户可能看到旧数据而不知道同步失败。

---

## 13. CURRENT COMPLETION STATUS

| 模块 | 状态 | 估计完成度 | 是否可用 | 主要问题 |
|---|---:|---:|---|---|
| 入口/Hero | 🟡 | 80% | 可打开 | 线上与当前工作树需复核；公开 health/目录需限流 |
| 用户名密码认证 | ✅ | 90% | 主路径可用 | body token 兼容层、真实环境错误恢复需测 |
| 玩家身份 | 🟡 | 80% | 部分可用 | 头像/字段/刷新恢复与输入上限需测 |
| Deadlock 天梯双排 | 🟡 | 80% | 核心可用 | pair 状态命名跳过 matched；并发/掉线需真实验证 |
| Deadlock 休闲多人 | 🔴 | 55% | 不可宣称完整可用 | group ready→playing 缺口，拜拜/统计受影响 |
| 候选确认/取消 | 🟡 | 75% | pair 可用 | Realtime 断线与超时 UI需测 |
| 房间聊天/账号交换 | 🟡 | 75% | pair 主路径可用 | Realtime 无重连；多人状态未闭环 |
| Session 结束/最近连接 | 🟡 | 75% | pair 可用 | stale active session 风险；异常退出边界需测 |
| 点赞/体验反馈 | 🟡 | 80% | API/DB 存在 | UI 延迟和 group 反馈需测 |
| 好友系统 | 🔴 | 25% | 当前应视为 Coming Soon | UI 关闭但 API/表仍在，需彻底定义/隔离 |
| 社区 | 🔴 | 5% | Coming Soon | 仅占位 |
| 联系我们/OPS 收件箱 | ✅ | 85% | 可用 | 登录限制/字数/OPS 权限和限速需测 |
| OPS 指标 | 🟡 | 80% | 可用 | 在线数受 presence 事件影响；运营登录无限速 |
| RLS/权限 | 🔴 | 60% | 不适合无审计上线 | 旧表 policy 过宽，applications 可篡改 |
| 部署/监控 | 🟡 | 75% | 有生产方案 | 当前线上版本、迁移版本、监控实际状态需复核 |

总体完成度是工程估计，不是产品承诺：**约 68/100**。

---

## 14. CONFIRMED WORKING FEATURES

以下是本次扫描中有代码/测试证据的功能，不等于已经在真实 Supabase 双账号公网环境通过：

- TypeScript `tsc --noEmit` 通过。
- Vitest：19 个文件、93 个测试通过。
- Next production build 通过，能够生成 API、`/ops` 和静态页面。
- Playwright 配置和测试发现正常：`tests/e2e` 当前列出 23 个测试。
- 用户名/密码认证 API 路由和 profile 绑定路径存在。
- 新匹配表、pair/group RPC、状态事件、确认和 feedback 的数据库代码存在。
- pair 独立确认逻辑存在：一方接受后另一方能读到自己的 snapshot 中的对方决定，UI 不要求同一瞬间点击。
- Service Role 与 RLS 的分层意图存在，公开 DTO 会掩码昵称。
- `/ops` 有 7/14/30/90 天指标、错误、反馈、健康信息和 30 秒静默刷新代码。
- `git diff --check` 通过。

未列入本节的功能，不应被新 AI 当作已确认可用。

---

## 15. KNOWN BUGS

### BUG-001：休闲多人匹配无法稳定进入 playing/正常拜拜（P1）

- **位置**：`supabase/migrations/0016_casual_group_matchmaking.sql` all-confirm 分支；`src/app/api/room/[code]/goodbye/route.ts`；`public/js/pages/room.js`。
- **触发**：休闲 group 达到人数，房主开始，所有成员接受，进入 room 后点击“拜拜”。
- **实际**：迁移创建 `rooms.status='ready'`、`sessions.status='ready'`，group/tickets=`matched`；没有 `/api/room/[code]/start`，而 `phase1_request_goodbye` 要求 `session.status='playing'`，可能返回 `SESSION_NOT_PLAYING`。OPS 的 playing count 也只统计 playing sessions。
- **预期**：所有成员确认后有明确 ready→playing 过渡，房间可正常聊天、结束、反馈并沉淀连接。
- **原因**：pair 自动 start 的设计未复制到 group；UI 又明确删除了旧开始游戏按钮。
- **复现**：需要真实 Supabase 多账号或数据库 fixture；静态迁移已确认，线上复现需要重新验证。
- **修复建议**：先决定产品语义（all-confirm 自动 playing，或房主确认 start），再补一个幂等的服务端 transition/RPC/API，并同步 room/session/group/ticket/metrics/realtime。
- **是否修复**：未修复。

### BUG-002：`activeSessionFor` 可能恢复历史 completed Session（P2）

- **位置**：`src/lib/api.ts` 的 `activeSessionFor`。
- **触发**：用户拥有多个历史房间，刷新/重新进入时调用 `/api/session` 或状态恢复。
- **实际**：查询按 room_members 所有历史 room，再取 status `ready|playing|completed` 中最新一条；没有限制 active member、room active status，也没有排除 completed。
- **预期**：只恢复当前 active room/session；已完成 session 应进入 gameover/历史，而非 active。
- **原因**：函数名与查询条件不一致。
- **复现**：可用两次 Session fixture 或真实账号完成一局后再开新房；需要重新验证 UI表现。
- **修复建议**：先按 active `room_members` + active room 过滤，再只允许 ready/playing；completed 由专用 gameover 查询读取。
- **是否修复**：未修复。

### BUG-003：旧表 RLS 暴露过宽（P1 安全/数据完整性）

- **位置**：`supabase/migrations/0001_init.sql` 的 `user_games_select`、`match_requests_select`、`applications_update_involved`；后续迁移未完全 drop。
- **触发**：已登录用户使用 Supabase anon client/PostgREST 直接读取旧表，或更新自己参与的 application。
- **实际**：旧匹配请求和用户游戏画像对 authenticated 全体可读；application 任一参与方的 `WITH CHECK` 未限制修改字段。
- **预期**：旧模型不可被新客户端直接使用；他人数据应通过最小 DTO，application 状态只能由服务端状态机修改。
- **原因**：从旧 MVP 迁移到新 realtime matchmaking 时保留兼容表/策略。
- **复现**：需在真实 Supabase 用两个普通用户 token 做 PostgREST/RLS 验证；策略代码本身已确认风险。
- **修复建议**：先搜全仓调用方，再新增收紧 migration（drop 旧 select/update，服务端 RPC only），不要直接删表。
- **是否修复**：未修复。

### BUG-004：Realtime 断线后房间/匹配可能停在旧状态（P1）

- **位置**：`public/js/realtime.js`。
- **触发**：断网、WebSocket 重连、Supabase channel subscribe error。
- **实际**：仅 `await channel.subscribe()`，没有 status handler/reconnect/backoff/断线 UI；room chat/account/goodbye 等可能继续显示旧状态。
- **预期**：断线可见、自动恢复或降级轮询，恢复后重新拉 snapshot。
- **原因**：当前实现把 Realtime 当作 best-effort 事件触发器。
- **复现**：需要浏览器 DevTools offline/限速 + 两账号；本次 E2E 未运行真实服务器。
- **修复建议**：增加 channel status 机、关闭时重建、指数退避、页面级 stale 标记和 fallback polling；写断线契约测试。
- **是否修复**：未修复。

### BUG-005：在线状态在异常关闭后可能长期为 true（P1/P2）

- **位置**：`public/js/app.js` beforeunload/pagehide/pageshow；`/api/online`、`/api/offline`。
- **触发**：浏览器崩溃、强制杀进程、断网、系统休眠、sendBeacon/keepalive 失败。
- **实际**：offline 请求没有到达时 profile 仍在线；heartbeat 已按产品要求取消，服务端没有 TTL reconcile。
- **预期**：用户关闭/失联后不再出现在在线/匹配池。
- **原因**：浏览器生命周期事件不是可靠消息队列，且产品要求取消心跳。
- **复现**：需要真实浏览器和网络故障；本次未执行。
- **修复建议**：先确认产品是否接受短暂 stale，再采用 last_seen TTL/服务端 expire，而非恢复高频 heartbeat；同步 matching eligibility 和 ops count。
- **是否修复**：未修复，且属于产品约束下的架构问题。

### BUG-006：OPS 密码缺少限速/锁定（P1 安全）

- **位置**：`src/app/api/ops/session/route.ts`、`src/lib/ops.ts`。
- **触发**：公开反复 POST 错误密码。
- **实际**：存在 cookie/token 校验和 hash，但未看到按 IP/账号的失败限速、锁定或告警。
- **预期**：运营登录抗暴力破解，失败可审计/告警。
- **原因**：MVP 先实现可用登录，安全控制未补齐。
- **复现**：代码层可确认缺少；线上攻击模拟需授权，不要直接压生产。
- **修复建议**：边缘/CDN/WAF + API 速率限制 + 失败事件/锁定；同时轮换 OPS_TOKEN/密码。
- **是否修复**：未修复。

### BUG-007：迁移/文档/约束可能不一致（P2）

- **位置**：README、`docs/DEPLOYMENT.md`、`20260819193000_feedback_limit.sql`、旧 sessions/match_requests 约束。
- **触发**：按旧文档只应用到 0008，或在新实例直接执行后端当前代码。
- **实际**：文档列出的迁移不完整；反馈 10–500 的后续约束需确认是否实际 drop 旧 2000；生产实例迁移版本未知。
- **预期**：代码、迁移、部署手册是同一版本事实源。
- **原因**：连续 MVP 迭代留下旧说明。
- **复现**：需要读取 Supabase `schema_migrations`/information_schema；当前实例状态需要重新验证。
- **修复建议**：生成一次 schema snapshot，更新部署文档，CI 检查迁移完整性；在确认线上备份后再补 migration。
- **是否修复**：未修复。

---

## 16. SUSPECTED RISKS（风险，不是已确认 Bug）

1. **多标签页状态竞争**：同一用户一个标签 start、另一个 cancel/confirm，active unique 虽能保护数据库，但 UI 可能互相覆盖。
2. **同一 pair 重试策略**：拒绝/取消后的 cooldown 是否所有路径都写入并被候选排序排除，需要数据库级验证。
3. **候选上限 100**：服务端 attemptMatch 只取有限候选；低用户量没问题，高并发时排序和公平性需压测。
4. **房间/Session 查询竞态**：Realtime 同时触发 rooms、sessions、room_members 多次 snapshot，可能发生顺序反转。
5. **feedback 幂等**：session_responses/matchmaking_feedback 有 unique，但 API 的 upsert 和 session completion 是否原子，需要重复提交测试。
6. **消息边界**：前端、API、DB 的字数限制可能不同；特殊 Unicode/超长 Data URL/HTML 转义要测试。
7. **图片 Data URL**：头像可能直接进 profile；未确认压缩/尺寸限制，可能导致请求过大和 DB 膨胀。
8. **公共 health/目录**：可能被高频抓取，影响 DB；需要 rate limit/cache 与匿名目录最小化。
9. **Supabase Realtime publication/RLS**：迁移虽加入 publication，生产实例是否完整应用需要检查 Dashboard/SQL。
10. **Next standalone + Caddy 同域代理**：Auth/REST/Realtime 的 WebSocket/headers 在香港节点需要实际断网与跨运营商验证。
11. **旧路由/旧页面复活**：hash route、localStorage、历史 branch 和旧 API 并存，刷新/直接访问旧 hash 可能回到废弃页面。
12. **Presence 与匹配资格**：在线字段 stale 时，公开目录过滤了 `profile.online`，但 ticket active 查询与 profile online 的结合不一定每条路径一致。

---

## 17. TECHNICAL DEBT

### 高

- 新旧两套匹配/申请/Session schema 和 RPC 并存，名称与状态语义不统一。
- `public/js/app.js` 巨型编排文件，任何 UI 改动可能改变网络/路由/状态。
- group casual lifecycle 没有统一 ready→playing transition。
- Realtime 没有可靠重连/降级状态机。
- 旧 RLS policy 仍暴露历史表。
- 迁移文档没有覆盖 0009–最新时间戳 migration。

### 中

- 前端 ES modules 没有 TypeScript 类型保护；API DTO 依赖运行时字段。
- 事件命名、状态名在 pair/group/legacy session 间不一致。
- online 只靠生命周期事件；无 TTL reconcile。
- 公开 health 与 directory 未见缓存/限流。
- 运营密码登录没有速率限制，且环境变量/DB 双来源需明确优先级。

### 低

- UI 视觉资产和旧说明文件较多，可能影响首屏加载。
- `games` 旧 seed 和前端 Coming Soon 列表不一致。
- 部分错误 catch 静默，不利于本地调试。
- 测试文件多为契约/静态断言，缺少共享 fixture 和真实 DB harness。

---

## 18. IMPORTANT DESIGN DECISIONS

以下是当前仍应遵守的产品/架构决定；若代码冲突，先报告冲突再改。

| 决策 | 为什么 | 当前实现 | 不要重新改成 |
|---|---|---|---|
| Deadlock 是当前唯一真实 MVP 游戏 | 先验证闭环，不扩散规则 | 前端主路径 Deadlock；旧 games seed 保留 | 不要让旧游戏 seed 自动出现在匹配入口 |
| 天梯只双排 | 遵守 Deadlock 官方组队约束 | 最新 ranked duo migration + pair path | 不要因为等待久而放宽硬规则/改多人 |
| 硬规则优先，软偏好可排序 | 规则以后可调、硬约束不能突破 | `rule_sets` + `rules.ts` + service rank | 不要把权重写死在 UI |
| 一方确认不要求另一方同时点击 | 避免误以为必须同步点击 | confirmations 独立记录 | 不要用整页刷新或同步按钮锁死 |
| 休闲可多人，达到最低人数可提前开始 | 支持“找 3 人但先来 2 人也开” | groups 表与 owner group/start | 不要退回固定双人匹配 |
| 匹配成功后优先自动进入房间 | 降低流失、闭环更短 | pair 成功时 room/session 创建和路由跳转 | 不要重新加入旧申请/玩家主页流程 |
| 房间内前置交流，实际游戏使用外部平台 | MVP 不做语音/游戏内集成 | chat/account exchange fields | 不要承诺平台内语音/游戏托管 |
| 联系我们直接进 OPS 收件箱，不发邮件 | 低成本运营验证 | `/api/feedback` + `/ops` | 不要按旧 README 强行接回 Resend |
| 好友系统暂时关闭 | 先验证匹配和留存，不扩范围 | 部分 UI Coming Soon；API/表仍残留 | 不要重新把旧 friends 页面接回主闭环 |
| 用户打开页面显示在线，取消 heartbeat | 降低实时成本 | pageshow/online + unload/offline | 不要未经确认恢复高频心跳 |
| 视觉保留警戒线、紫/黑/白色系统，Hero 与页面交互 | 品牌方向已定 | public CSS/GSAP/hero-waves | 不要重新引入旧棱镜/大量游戏背景 UI 作为业务变更 |
| 反馈先落库再展示 | 运营可追踪 | feedback 表 + requestId | 不要只在浏览器 toast 中“假提交” |

### 已决定但未实现

- 休闲 group all-confirm 后可靠进入 playing 并完整结束。
- Realtime 断线重连和 stale 状态 UI。
- 旧表 RLS 收紧/旧模型彻底隔离。
- Presence 的异常关闭 TTL reconcile。

---

## 19. ABANDONED / DEPRECATED IDEAS

- **旧棱镜/复杂场景背景**：曾多次尝试，当前方向已放弃；不要重新生成大面积棱镜 UI。
- **三个大按钮集中在 Hero**：已改为 Hero + 侧导航/摇人页面分离；不要恢复旧集中式方块首页。
- **票根/袋子/盲盒/箭头等装饰交互**：历史视觉探索，当前不是业务依赖，除非明确重新授权不要继续投入。
- **固定“开始游戏”按钮**：pair 设计为自动进入；group 需要补状态 transition，但不应直接复制旧按钮而不定义 server state。
- **旧申请一起玩 / 玩家主页 / `applications` 流程**：已被新实时匹配替代；旧表仅兼容/迁移遗留。
- **好友系统现在上线**：已决定暂时 Coming Soon；后续重新开发前先清理入口和权限。
- **Resend 反馈邮件**：当前产品决定直接 OPS 收件箱；README 的邮件说明是过时文档。
- **匹配等待时突破 Deadlock 官方硬规则**：明确禁止。
- **匹配中全屏循环加载动画阻塞业务**：视觉加载只能辅助，不应遮蔽状态或造成刷新假象。

---

## 20. DO NOT CHANGE

在没有新确认前，不要：

1. 改 Deadlock 天梯双排硬约束。
2. 删除 `matchmaking_state_events`、requestId、version 或唯一 active ticket 约束。
3. 让浏览器直接写匹配/Session/事件关键表，绕过 Service Role/RPC。
4. 把房间账号、聊天、拜拜改回旧 application 流程。
5. 用前端按钮隐藏代替后端权限和成员校验。
6. 恢复好友系统为已上线功能。
7. 把旧 `games` seed 当作当前支持游戏列表。
8. 删除迁移文件、生产数据或直接清理 Supabase 表；任何数据清理必须先备份、dry-run、确认范围。
9. 把 `SUPABASE_SERVICE_ROLE_KEY`、`OPS_PASSWORD`、`OPS_TOKEN` 写入 Git、浏览器或日志。
10. 在未验证目标 Supabase migration version 前更新生产。
11. 通过整页 reload 解决实时状态问题；应 patch snapshot / state machine。
12. 继续堆叠到 `public/js/app.js`，除非先说明耦合影响和回归范围。

---

## 21. ENVIRONMENT & CONFIGURATION

### 21.1 必需变量（只记录名称）

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY              # server-only
SUPABASE_PUBLIC_URL                     # optional HK same-domain override
SUPABASE_INTERNAL_URL                   # optional server direct route
OPS_TOKEN                               # server-only
OPS_PASSWORD                            # server-only / initial fallback
ALERT_WEBHOOK_URL                       # optional monitoring alert
APP_VERSION                             # deployment health label, if configured
```

### 21.2 配置文件

- `package.json`：脚本和依赖。
- `tsconfig.json`：strict、allowJs、noEmit、`@/* -> ./src/*`。
- `next.config.mjs`：`reactStrictMode: true`，`output: 'standalone'`。
- `playwright.config.ts`：默认 base URL `http://127.0.0.1:3000`，无外部 URL 时启动 `pnpm start`。
- `deploy/china-hk/compose.yaml`、`Caddyfile`、`deploy.sh`：生产容器和代理。
- `.env.example`：变量名模板，不含 secret。

### 21.3 命令

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test --list
pnpm exec playwright test
pnpm verify
./scripts/check-public.sh https://jiyuan.online
```

发布前按 `deploy/china-hk/README.md` 用已验证目录 rsync，排除 `.env.production`、`.git`、`node_modules`、`.next`、测试报告，再 SSH 执行部署脚本。

---

## 22. TESTING STATUS

### 本次已执行

- `tsc --noEmit`：通过。
- Vitest：19 files / 93 tests passed。
- `next build`：通过，静态页面与 API 编译完成。
- `playwright --list`：通过，发现 23 个 E2E 测试。
- `git diff --check`：通过。

### 本次未能完成

- 没有在本次 sandbox 中启动真实 `next start` 进行浏览器 E2E：监听端口被环境 `EPERM listen 0.0.0.0` 阻止。这是测试环境限制，不是“E2E 失败”，但也不能把 E2E 说成通过。
- 没有用两个/多个真实 Supabase 用户执行公网匹配、断网、Realtime、group、房间结束。
- 没有读取生产 Supabase 的真实 `schema_migrations`、RLS policies、publication、数据计数。
- 没有做压力/并发/恶意输入测试。

### 测试可信度

静态/单元/编译可信度较高；业务实时一致性、线上部署、RLS 和多人 group 可信度不足，必须在隔离环境补做。

---

## 23. LAST KNOWN STABLE STATE

- 代码 HEAD：`7bee0a2`，分支 `agent/ui-shell-production`。
- 工作树在本次交接前已经 dirty，包含 UI、匹配 service、迁移、E2E 和资产改动；本次只新增本交接文档，不应把所有 dirty diff 误认为一个可发布 commit。
- 最近一次静态验证：typecheck、Vitest、Next build 通过。
- 最可能被最近改动影响的区域：
  1. `public/js/app.js` / home / landing / matching 的实时状态与路由；
  2. `src/lib/matchmaking/*` 和 `0009` / `0016` migration；
  3. ranked duo-only 迁移；
  4. `realtime.js` 和 room/gameover；
  5. 新游戏/段位图片与 Hero 布局。
- `https://jiyuan.online` 当前线上代码是否等于这个 HEAD、线上 DB 是否已应用最新 migration：**需要重新验证**。

---

## 24. CURRENT TASK

当前任务是生成本交接文档，不是继续开发 UI 或修改数据库。

本次已完成：

- 重新扫描目录、依赖、Next/静态前端、API、lib、迁移、测试和部署文件。
- 对照当前代码重建 pair/group/room/session/goodbye/presence 状态机。
- 运行 typecheck、Vitest、build、Playwright test discovery、diff check。
- 记录已确认缺陷和需要真实环境复核的风险。

本次未做：

- 未修改任何应用源代码。
- 未执行 Supabase 写入、迁移、清理或生产部署。
- 未声称生产公网完整可用。

下一步不是“继续做新功能”，而是先按 P0/P1 排除状态机、多人 group、RLS、Realtime 和 presence 问题。

---

## 25. NEXT PRIORITIES

### P0（先阻止错误发布）

1. 在隔离 Supabase staging 上确认真实 migration version、RLS、Realtime publication；备份后执行 schema diff。
2. 修复并测试 casual group `ready → playing → goodbye → completed → feedback → recent_connections` 完整链路；明确自动开始还是房主开始，补幂等 RPC/API。
3. 用两个 pair 账号和 2–5 个 casual 账号做真实状态机测试，覆盖同时 confirm/reject/cancel、掉线、超时、刷新。
4. 关闭旧表的直连读写权限，收紧 `applications` update；确认没有生产客户端依赖后再处理旧 RPC。

### P1（核心稳定性/安全）

1. 为 Realtime 增加 subscribe status、重连、退避、fallback polling、stale UI 和恢复 snapshot。
2. 设计无 heartbeat 下的 presence TTL/last_seen reconcile，并让 matching/health/ops 使用同一在线判定。
3. 修复 `activeSessionFor` 的 active room/session 过滤，补刷新和历史 session 回归测试。
4. OPS 登录增加速率限制、失败审计/告警；轮换生产 OPS secret。
5. 对所有关键 mutation 做 requestId/idempotency/concurrency tests。

### P2（数据与可维护性）

1. 统一 pair/group/session 状态词汇，避免 matched/playing/ready 语义漂移。
2. 更新 README/DEPLOYMENT/P1 docs 的真实 migration、反馈邮件已废弃、香港部署和当前入口。
3. 清理/隔离旧朋友和 application 页面、旧匹配代码；先搜引用，保留可回滚迁移。
4. 给 API DTO、状态事件和前端 snapshot 建共享类型/契约。
5. 限制头像 Data URL、消息/反馈长度，统一前端/API/DB 约束。

### P3（体验和后续）

1. 在核心闭环稳定后再处理 UI 细节、动画、素材压缩和响应式。
2. 社区、更多游戏、正式好友系统不属于当前稳定 MVP 优先级。

---

## 26. FILES THE NEXT AI SHOULD READ FIRST

按顺序阅读，不要先改 CSS：

1. `PROJECT_HANDOFF.md`（本文件；先看事实/边界/已知 Bug）。
2. `package.json`、`README.md`、`docs/DEPLOYMENT.md`、`docs/P1-OPERATIONS.md`（注意文档与代码冲突）。
3. `public/index.html`、`public/js/app.js`（入口、hash 路由、全局 state、恢复、网络事件）。
4. `public/js/api.js`、`public/js/realtime.js`、`public/js/store.js`。
5. `public/js/pages/home.js`、`matching.js`、`room.js`、`gameover.js`、`landing.js`。
6. `src/lib/types.ts`、`auth.ts`、`http.ts`、`api.ts`。
7. `src/lib/matchmaking/types.ts`、`rules.ts`、`state-machine.ts`、`service.ts`。
8. `src/app/api/matchmaking/*`、`src/app/api/state/route.ts`、`src/app/api/room/[code]/*`。
9. 按顺序阅读 `supabase/migrations/0009*`、`0010*`、`0011*`、`0012*`、`0016*`、三个时间戳 migration，再回看 `0001–0008` 的旧表/RLS。
10. `tests/*.test.ts`、`tests/e2e/mvp-closure.spec.ts`、`tests/casual-group-matchmaking-contract.test.ts`。
11. 最后读 `deploy/china-hk/*`、`scripts/check-public.sh` 和监控脚本。

---

## 27. NEW SESSION STARTUP PROCEDURE

新 AI 接手时必须按以下顺序操作，**不要一上来修改代码**：

1. 阅读本文件，提取当前已确认 Bug、P0/P1 和“不要改变”的决策。
2. `git status --short --branch`，记录 dirty diff；不要 reset/checkout/clean。
3. 扫描 `package.json`、`src`、`public`、`supabase/migrations`、`tests`、`deploy`。
4. 确认当前 branch/HEAD、线上部署 commit、Supabase migration version；若无法连接，写“需要重新验证”。
5. 读 `public/js/app.js` 和 `src/lib/matchmaking/*`，重新画 pair/group/room/session 状态机。
6. 读所有当前 API route，列出每个 mutation 的鉴权、幂等键、RPC 和 DB 影响。
7. 用 `information_schema`、`pg_policies`、`supabase_realtime` 检查生产/隔离 DB，不凭 README 猜 schema。
8. 先运行：

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm exec playwright test --list
   ```

9. 在 staging 用最少两账号做 pair，至少三账号做 casual group；记录每次状态、API response、DB row、Realtime/UI。
10. 先复现 P1：group ready/playing、Realtime 断线、activeSession stale、RLS、presence；不要先做 UI。
11. 若文档与代码冲突：**优先相信当前代码，但先判断代码是否本身是 Bug**；在文档中更新冲突，不隐瞒。
12. 修复前写小范围计划和回归矩阵；每个状态变更必须有迁移/服务/API/UI/测试对应关系。
13. 修复后重新运行全套静态检查和真实双账号/多账号测试，再决定是否部署。

---

## 28. HANDOFF CONFIDENCE

- **项目理解完整度：86/100**。目录、前后端、迁移、状态机、API、部署和测试均已扫描；生产 DB 实际状态和所有真实用户操作仍未在本次环境中复现。
- **代码扫描完整度：88/100**。核心代码和全部 API/migration 文件列表已覆盖，具体旧文件的每条引用、所有 SQL 合并后的最终约束仍需 schema introspection。
- **交接可信度：84/100**。足以让新 AI 开始审计和修复，不足以把公网多人匹配宣称为稳定生产功能。

### 仍无法确认的内容

1. `jiyuan.online` 当前部署 commit 是否为 HEAD `7bee0a2`。
2. 生产 Supabase 实际已应用到哪一个 migration、最终 RLS/policy/constraint/publication 状态。
3. 两个真实账号 pair 在公网 Realtime 下的确认、房间、拜拜、反馈是否完全一致。
4. 休闲 2–5 人 group 在真实 DB 中的 ready→playing→completed 行为；静态代码已经显示高概率失败。
5. 浏览器断网/崩溃时 online/offline、ticket expiry、公共目录和 OPS counts 的实际延迟。
6. 多标签页、同时 mutation、重连、超长输入、Data URL 头像的实际表现。
7. 旧 `friends` / `applications` 入口是否仍被某个线上 hash、localStorage 或部署资产调用。

这份文档没有把历史聊天中的设计愿望、旧 README 或视觉截图当成已实现事实。下一位 AI 应先补齐上面“无法确认”的证据，再修改代码。
