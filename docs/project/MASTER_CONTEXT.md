# 机缘项目长期上下文

> 文档用途：记录不会随一次部署或一次测试结果频繁变化的项目事实、术语和产品边界。
> 
> 事实优先级：当前源码与已验证生产事实 > 当前 migration / 配置 > 已确认产品决策 > 历史交接材料 > 推测。

> 当前 canonical repository：`/Users/jasonhu/Documents/ChatGPT/project/JY_source`。`PROJECT-S` 仅是历史产品名/GitHub remote 名，不是第二本地事实源。当前 `REAL PRODUCTION USERS=0`；synthetic capacity account 规则见 `DECISIONS.md` 与 `SYNTHETIC_ACCOUNT_REGISTRY.md`。

## 1. 机缘是什么

“机缘”（Jiyuan，历史工程名为 PROJECT-S）是面向 PC 游戏玩家的实时找队友 Web MVP。用户选择游戏和匹配条件，系统寻找当前也想以相近方式游玩的真实玩家；匹配成功后进入 Room / Session，交换当前对局所需信息、聊天、正常结束并提交反馈，最后沉淀 Recent Connections。

当前正式验证的游戏规则是 Deadlock。其他游戏可能仍存在于旧种子数据、数据库目录或 Coming Soon UI 中，但不等于已经开放匹配。

## 2. 目标用户与核心承诺

- 目标用户：想马上找到合适队友、而不是维护长期好友列表的 PC 游戏玩家。
- 核心承诺：此刻想怎么玩，就此刻找到一起玩的真人。
- MVP 目标：验证“认证 → 匹配配置 → 实时匹配 → Room / Session → 聊天与结束 → Feedback / Recent Connections”的可用闭环。
- 当前阶段不包含 Community、Friends 正式产品化、第二款游戏或商业化扩展。

## 3. 核心用户流程

```text
注册 / 登录
  → 创建或恢复玩家资料
  → 选择 Deadlock、模式、段位、位置、麦克风和队友人数
  → 创建或加入 ticket / pair / group
  → 成员确认
  → 创建 Room / Session
  → 展示 members[]、聊天、玩家条件和账号信息
  → Goodbye（正常共同结束）或 Explicit Leave（单方离开）
  → Session completed / cancelled
  → Gameover / Feedback
  → Recent Connections
  → 重新匹配
```

页面刷新、短暂断线、Back / Forward 或离开页面再返回时，恢复依据必须来自服务端真实 Room / Session / member 状态，而不是浏览器内存中的临时 partner 状态。

## 4. 匹配模式

### 4.1 Deadlock Ranked

Ranked / 冲分保持合法的 duo-only 规则：一次匹配只补一名队友，pair / 两人确认和两人 Session 是该模式的业务语义，不应被 Casual 多人化改动误伤。

### 4.2 Deadlock Casual Group

Casual 使用动态 Group / members[] 模型，目标队友数量和最小可开始人数来自当前匹配配置。Room / Session 不能再以 `me + partner` 作为默认数据模型。

## 5. 术语与数据模型

| 术语 | 含义 |
|---|---|
| User / Profile | Supabase Auth 用户及其 `profiles` 玩家资料；当前用户称 `currentUser`。 |
| Ticket | 一名用户当前一轮匹配意图，位于 `matchmaking_tickets`。 |
| Pair | Ranked duo 的两人候选/匹配关系；是合法的双人业务模型。 |
| Group | Casual 多人匹配关系，成员来源是 `matchmaking_group_members`，对外模型是 `members[]`。 |
| Room | 匹配后的房间容器，承载成员、消息和会话关联。 |
| `room_members` | Room 的成员及其 active / exited / disconnected 状态。 |
| Session | 一次实际共同游玩连接的生命周期；通常由 `ready / playing` 进入 `completed` 或 `cancelled`。 |
| Goodbye | 正常共同结束。每个当前有效成员各自确认，计数为动态 `x/n`。 |
| Explicit Leave | 用户明确点击离开；不是刷新、导航或短暂断线。按当前产品语义会取消整个 Session，并同步取消 Room。 |
| Feedback / Gameover | Session 结束后的赛后反馈流程。 |
| Recent Connections | 已完成 Session 的成员之间沉淀的最近连接关系。多人 Session 按成员关系生成，而不是固定一对。 |
| Presence | 用户是否仍被视为在线的独立在线状态，不等同于 Room / Session 生命周期。 |

## 6. 核心产品规则

1. `Refresh != Leave`。普通刷新、页面跳转、Back / Forward、短暂网络断开不能直接触发退出生命周期。
2. 只有用户明确执行 Explicit Leave，才进入主动退出路径；Presence offline 与 Room / Session 状态解耦。
3. 任意成员 Explicit Leave 后，Session 进入 `cancelled`，对应 Room 立即进入 `cancelled`；不允许出现 terminal Session + `Room.status = 'playing'`。
4. Casual Goodbye 使用当前有效成员的真实数量作为 denominator。三人流程必须是 `0/3 → 1/3 → 2/3 → 3/3 → completed`。
5. Goodbye 请求必须服务端幂等；重复点击、重试、刷新、重连不能重复计数。
6. Room / Session 成员始终以 `members[]` 表达。`partner` 只能作为旧兼容字段，不能作为多人恢复或渲染的事实源。
7. Completed Session 的每个成员都进入正确的 Gameover / Feedback 流程，Recent Connections 采用 N 人关系语义。
8. Presence 当前实现为 10 秒 heartbeat、30 秒 effective-online TTL、Room 180 秒 reconnect grace；180 秒从最后一次在线/断连锚点计算，不是 30 秒 TTL 之后再加 180 秒。超时由数据库 reconciliation / pg_cron 驱动，不依赖 OPS 请求或其他用户 heartbeat。

## 7. 技术架构

```text
Browser
  ├─ public/index.html + public/js（hash 路由、状态恢复、Room UI）
  ├─ /api/* 请求
  └─ Supabase Realtime 订阅 / 状态刷新
        ↓
Next.js App Router / standalone
  ├─ API route：认证、状态、匹配、Room、Session、反馈、OPS
  ├─ src/lib/auth.ts：认证与 profile
  ├─ src/lib/matchmaking/*：规则、服务与状态机
  ├─ src/lib/http.ts：错误、request_id、幂等头
  └─ src/lib/api.ts：服务端聚合 DTO
        ↓
Supabase
  ├─ Auth
  ├─ PostgreSQL / RPC / trigger / RLS
  ├─ Realtime publication / Postgres changes
  └─ pg_cron（Presence stale reconcile）
        ↓
Tencent Cloud Hong Kong Docker Compose + Caddy
  └─ https://www.jiyuan.online
```

浏览器不能持有 Service Role 或数据库密码。服务端通过 authenticated identity 验证用户，业务写入优先走受控 API / RPC；Realtime 事件用于触发状态重新读取，最终状态以服务端 DTO 为准。

## 8. 长期边界

- 不把旧的“申请一起玩”模型重新作为主流程。
- 不把 Friends API / 表存在写成 Friends 已正式上线。
- 不在没有明确授权时扩展 Community、第二款游戏、商业化或无关 UI。
- 不因历史 migration history 缺失而盲目 replay 旧 migration；生产修复采用差异核验和 forward-only migration。
- 历史 5 个 ghost Room 属于已记录的历史基线，不作为新 ghost 计数，也不在无授权时清理。
