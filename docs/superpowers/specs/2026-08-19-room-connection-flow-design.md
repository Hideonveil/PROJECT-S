# PROJECT-S 房间连接闭环与匹配向导改进设计

日期：2026-08-19  
状态：用户已确认聊天内方案，等待文档复核

## 目标

在不改变 PROJECT-S 核心产品方向的前提下，修正匹配确认、房间导航和页面刷新问题，并把房间从“普通卡片页面”升级为完整的临时连接空间。好友添加、双方结束和评价必须由服务器保存真实状态，支持刷新、断线重连和双方同时操作。

本次范围覆盖：

1. 匹配向导按钮裁切。
2. Hero 到登录/注册的专用转场。
3. 对方确认时局部更新与提醒。
4. 房间内好友申请和确认。
5. 房间存在时仍允许正常导航。
6. 房间视觉重构。
7. 双方“拜拜”结束协议。
8. 评价页重构与乐观交互。
9. 上分模式合并自己的位置与队友位置。
10. 娱乐模式改为选择队友数量。

## 非目标

- 不在本次修改 Deadlock 官方段位硬规则。
- 不增加新的游戏匹配配置。
- 不实现语音、游戏内启动器或 PROJECT-S 内游玩功能。
- 不写死新的匹配权重、评分公式或推荐算法。
- 不把聊天升级为完整社交系统。

## 已确认的产品规则

### 房间开始

双方确认匹配并创建房间后，Session 自动进入 `playing`。不再要求任何一方点击“开始游戏”，也不再显示开始游戏按钮。

### 正常结束

正常结束必须由双方分别确认“拜拜”：

1. 玩家 A 点击“拜拜”。
2. A 看到“确定要拜拜吗？”确认框。
3. A 确认后，服务器保存 A 的结束请求，房间继续存在。
4. A 显示“等待对方拜拜”。
5. B 在房间中看到“A 想结束这次连接，是否拜拜？”。
6. B 确认后，服务器原子地完成 Session、关闭房间并沉淀最近连接。
7. 双方进入评价页。

只有一方确认时不能结束 Session。请求方可以撤回自己的拜拜请求。另一方关闭确认框代表暂不结束，不改变 Session 状态。

### 异常结束

“主动退出房间”继续作为异常操作：Session 记为 `cancelled`，原因是 `member_exited`，不进入正常评价，不创建正常对局记录。它与“拜拜”严格分开。

### 好友关系

好友关系必须经历请求和确认：

- 请求方写入一条 `pending` 关系。
- 接收方接受后，双方关系变为双向 `accepted`。
- 接收方拒绝后，待处理关系删除。
- 重复请求、双方同时请求和重复接受必须幂等。
- 已经是好友时不能再次发送申请。

## 数据模型

### `session_goodbye_requests`

新增表保存正常结束意愿：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `session_id` | uuid | 对应 Session |
| `user_id` | uuid | 提出拜拜的玩家 |
| `requested_at` | timestamptz | 提出时间 |
| `updated_at` | timestamptz | 更新时间 |

约束：

- `unique(session_id, user_id)`，防止重复点击产生多条记录。
- 用户必须是 Session 成员。
- Session 只有处于 `playing` 时才能提出拜拜。
- 该表加入 Supabase Realtime publication。
- 浏览器不直接写表；由服务端 API 调用受控数据库函数。
- RLS 默认拒绝客户端直接修改，服务端使用 `service_role`。

### `friendships`

复用现有 `status in ('pending', 'accepted', 'blocked')`：

- A 请求 B：写入 `(A, B, pending)`。
- B 接受：将 `(A, B)` 改为 `accepted`，并创建或更新 `(B, A, accepted)`。
- B 拒绝：删除 `(A, B, pending)`。
- `friendsFor()` 只返回 `accepted`。
- 状态接口另外返回当前用户收到和发出的 `pending` 请求。

### Session 自动开始

匹配双方确认后，房间和 Session 直接创建为 `playing`，并写入 `started_at = now()`。匹配 Pair 与 Tickets 同步进入 `playing`，避免“房间已经建立但 Session 仍停在 ready”的中间状态。

## 数据库函数

### `phase1_request_goodbye(session_id, actor_id, requested, request_id)`

在同一事务中：

1. 锁定 Session。
2. 验证操作者属于 Session。
3. Session 已经完成且原因是 `mutual_goodbye` 时，直接返回现有完成结果。
4. 其他情况必须验证 Session 处于 `playing`。
5. `requested=true` 时幂等写入请求；`false` 时删除操作者请求。
6. 统计该 Session 的请求人数。
7. 若所有有效成员均已请求，调用现有正常完成逻辑，原因写为 `mutual_goodbye`。
8. 返回 Session、请求者列表以及是否已完成。

函数必须撤销 `PUBLIC`、`anon`、`authenticated` 的执行权限，只授予 `service_role`。

### 好友申请事务

好友请求与响应可使用服务端数据库操作；接受动作必须在单次事务或受控 RPC 中完成双向 accepted 写入，防止只成功一半。

## API 变化

### 新增

- `POST /api/room/[code]/goodbye`
  - 请求：`{ requested: boolean }`
  - 返回：`{ room, session, goodbyeRequests, completed }`
- `POST /api/friends/respond`
  - 请求：`{ requesterId, decision: 'accepted' | 'rejected' }`
  - 返回：好友列表与待处理申请。

### 修改

- `POST /api/friends/add`
  - 从立即建立好友改为创建 pending 请求。
  - 返回 `friendRequestStatus`。
- `GET /api/state`
  - 房间增加 `goodbyeRequests`。
  - 增加 `incomingFriendRequests` 和 `outgoingFriendRequests`。
- `POST /api/matchmaking/confirm`
  - 双方确认后直接建立 playing Session。
- `POST /api/room/[code]/feedback`
  - 只保留 `rating` 与 `liked`。
  - 不再由新 UI 提交 `wantAgain`。

### 移除

- 删除前端对 `/api/room/[code]/start` 的调用。
- 确认没有任何客户端入口后删除 start API 和旧 `startGame()` 代码。

## Realtime 与页面更新

### 匹配确认

匹配确认变化只调用 `updateMatchingView()`：

- 更新双方确认标签。
- 更新说明文案。
- 对方首次变为 accepted 时显示一次轻量 Toast：“对方已接受，正在等你。”
- 保留匹配计时器、Modal DOM 和动画实例。
- 只有收到房间创建结果时才导航至房间。

### 房间

Realtime 监听：

- `rooms`
- `sessions`
- `room_members`
- `session_goodbye_requests`
- `friendships`
- `profiles`（游戏账号更新）

房间内变化优先使用局部 DOM 更新：

- 好友请求状态。
- 拜拜请求状态。
- 点赞和评价按钮。
- 游戏账号。

结构发生根本变化（房间结束、参与者异常退出）时才重新渲染或切换页面。

### 导航

删除“只要 `state.room` 存在就强制 `navigate('#/room')`”规则。

- 刚匹配成功：自动进入房间一次。
- 用户主动进入“我的、朋友、社区”：保持用户选择。
- 导航栏显示进行中房间入口或状态标记，点击可回房间。
- 刷新应用时，如果 URL 是房间则恢复房间；如果 URL 是其他合法页面则保留该页面。

## 匹配向导

### 上分模式

步骤为：

1. 游戏目的。
2. 当前段位。
3. 位置配置。
4. 是否开麦。

位置配置同一页包含两个独立多选组：

- `ownRoles`：我的位置。
- `teammateRoles`：希望队友的位置。

“不限”与具体位置互斥；选择不限会清空其他位置，选择具体位置会取消不限。开始匹配时两组数据分别写入请求，不混合为普通标签。

### 娱乐模式

步骤为：

1. 游戏目的。
2. 找几个队友。
3. 是否开麦。

不显示段位、自己的位置或队友位置。队友人数范围为 1～5。

### 按钮裁切

向导主体使用可收缩内容区，操作栏保留底部安全空间。1366×768、1440×900 和 1920×1080 下，“下一步”“开始匹配”必须完整可见；页面允许必要的垂直滚动，不使用会裁切操作栏的固定高度和 `overflow:hidden`。

## Hero 到账号页转场

只有当当前路由为 Hero 且操作为登录或注册时，调用现有 PROJECT-S 设备图标转场：

- 无文字。
- 紫色背景。
- 设备图标依次切换。
- 500～650ms 最短持续时间。
- 注册/登录内部切换、匹配过程要求登录、登出后进入账号页均不触发该专用转场。

## 房间视觉系统

### 概念

房间是“临时连接舱”，而不是后台管理面板。页面需要表达两个陌生玩家通过 PROJECT-S 临时建立了一条连接。

### 色彩

- `Room Paper`：`#F5F3EF`，页面主背景。
- `Room Ink`：`#111118`，导航、文字和主按钮。
- `Signal Violet`：`#8B6CFF`，连接线、选中和实时状态。
- `Signal Mist`：`#EAE4FF`，紫色浅层背景。
- `Online Green`：`#4FAE5A`，在线状态。
- `Exit Red`：`#D6534D`，只用于异常退出。

### 布局

桌面端主体为两列玩家连接结构：

```text
ROOM / 房间号 / 连接状态

玩家 A  ───────── 紫色连接轴 ───────── 玩家 B
我的账号                                  对方账号
好友状态                                  好友申请

                         拜拜

聊天区域
动态警戒线
```

两侧玩家卡片使用清晰描边和少量浅紫层次，不堆叠通用 `.card`。警戒线仅位于房间边界、拜拜确认和异常状态。聊天降低视觉权重。

### 动效

- 连接轴有低频呼吸动画。
- 好友申请从对应玩家一侧滑入。
- 拜拜按钮 Hover 有轻微拉伸和紫色信号闪动。
- 双方拜拜完成时连接轴从中间收束，随后进入评价页。
- 尊重 `prefers-reduced-motion`。

## 评价页面

页面只保留：

1. 对方身份。
2. 头像旁的点赞按钮。
3. 添加好友、等待确认或已是好友状态。
4. 游玩体验：`happy`、`meh`、`bad`。
5. 查看最近连接和返回摇人。

删除“下次还愿意和 TA 一起玩吗”。旧字段可以保留兼容历史数据，但新 UI 不再读取或提交。

点赞、评价和好友按钮采用乐观更新：立即改变 DOM 与按钮状态，后台异步保存；失败时恢复旧状态并显示局部错误。不能调用整页 `render()`。

## 错误处理与并发

- 重复点击拜拜使用 Idempotency-Key，不产生重复请求。
- 双方同时拜拜时，数据库行锁保证 Session 只完成一次。
- Session 已完成后再次请求返回同一完成结果。
- 断线重连后从 `/api/state` 恢复拜拜与好友申请状态。
- 好友双方同时发送请求时，服务端将其合并为 accepted，避免两个 pending 互相等待。
- 接受已经失效或已处理的好友请求返回当前真实状态，而不是 500。
- UI 请求中禁用对应按钮，但不冻结整个房间。

## 测试策略

### 单元与服务测试

- 上分路径包含 ownRoles 与 teammateRoles。
- 娱乐路径只包含 team 与 voice。
- 不限和具体位置互斥。
- 一方拜拜不完成 Session。
- 双方拜拜只完成一次并生成最近连接。
- 拜拜撤回不结束 Session。
- 好友请求为 pending，接受后双向 accepted，拒绝后消失。
- 同时好友请求自动合并。
- `friendsFor()` 不返回 pending。

### E2E

- 低高度屏幕完整显示下一步按钮。
- Hero 登录和注册播放专用转场；其他入口不播放。
- 对方确认不替换 matching modal，计时器不重置，并出现提醒。
- 房间存在时可以进入“我的”，不会被送回房间。
- 好友请求在对方房间实时出现并可接受。
- 单方拜拜后双方房间仍存在。
- 双方拜拜后双方进入评价页。
- 评价页点赞与评分不替换页面根节点。
- 房间不显示开始游戏按钮。
- 异常退出继续显示“对方主动退出了游戏”。

### 生产验证

- TypeScript、Vitest、Next build、完整 Playwright 全部通过。
- Supabase migration、RLS 与函数权限验证。
- 双浏览器真实账号走完整匹配、好友申请、双方拜拜和评价。
- Vercel READY 后在生产部署复跑关键 E2E。
- 检查 Vercel Runtime Errors 和 `/api/health`。

## 发布顺序

1. 写失败测试并确认失败原因正确。
2. 创建 Supabase migration 与服务层测试。
3. 实现拜拜协议和好友请求 API。
4. 扩展 `/api/state` 与 Realtime。
5. 修复匹配确认局部更新和房间导航。
6. 调整匹配向导。
7. 实现 Hero 专用转场。
8. 重构房间和评价 UI。
9. 完整自动化与双浏览器验证。
10. 应用生产 migration，再部署 Vercel。

## 风险控制

- 数据库 migration 必须先在 SQL 级别验证，再应用生产。
- 好友从“立即添加”变为“等待确认”会改变现有体验，所有旧调用必须一起更新。
- Session 自动 playing 会影响统计，确认 `playing` 计数和最近连接只在双方拜拜后结算。
- 房间局部更新不能破坏聊天输入和已有消息滚动位置。
- 不删除历史 `want_again` 数据，只停止新 UI 使用，避免破坏旧记录。
