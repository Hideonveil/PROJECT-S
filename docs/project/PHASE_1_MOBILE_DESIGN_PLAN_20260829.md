# Phase 1｜手机端产品设计与实施计划

> 日期：2026-08-29（Asia/Shanghai）
>
> 状态：`DESIGN READY / IMPLEMENTATION NOT STARTED`
>
> 依据：`PHASE_0_CURRENT_PRODUCT_AUDIT_20260829.md`、`research/MOBILE_WEB_PLATFORM_RESEARCH_20260829.md`、DEC-015、DEC-016。

## 一句话设计定义

手机端不是缩小的 PC，也不是第二套机缘。它是 **同一个 Room-first 产品的竖屏“随身组队台”**：同一身份、
同一匹配、同一 Room、同一聊天和同一终态，只把信息顺序、触控方式、滚动区域和底部操作重新设计成手机最自然
的形态。

## 1. 设计原则

1. **同一业务事实**：PC 与手机共用 Auth、Ticket、Room、Session、Realtime、API 和服务端恢复裁决。
2. **不同展示层**：允许页面布局不同，不允许复制 Matching / Room / Session 状态机。
3. **Room 稳定不重挂**：软键盘、地址栏、方向变化、Realtime 更新只能局部调整，不得重建整个 Room。
4. **聊天是主滚动区**：消息再多也不能把整页撑长；成员、输入和关键动作保持可见。
5. **操作必须有回声**：发送、停止招募、拜拜、溜了、退出都必须有 pressed/loading/disabled/result 状态。
6. **移动能力检测**：用 CSS/JS feature detection，不用 UA 猜 Safari、Chrome 或微信的业务行为。
7. **先普通网页**：第一版不加入 PWA、Service Worker、离线缓存或安装 Gate。

## 2. 视觉方向

### 产品主题

保留当前“纸张 + 墨色 + 紫色信号 + 警戒线”的机缘语言。手机端的记忆点不是再做一张大卡片，而是一个始终
稳定在底部的 **LIVE ACTION DECK**：像随身电台的控制面板，显示当前连接/招募状态并承载输入与关键动作。

### 色彩 token

| 名称 | 色值 | 用途 |
| --- | --- | --- |
| Paper | `#F8F7F2` | 页面底色 |
| Ink | `#121118` | 主文字、成员栏、关键边界 |
| Signal Violet | `#7659DF` | 选择、连接、招募、主 CTA |
| Signal Soft | `#EEE9FF` | 选中背景和非危险提示 |
| Live Mint | `#DFF2E7` | 已连接、已同步、成功 |
| Alert Red | `#D6534D` | 退出、失败、危险确认 |

不为每款游戏重做整套品牌色。游戏只通过卡片图、轻量 atmosphere token、词汇和规则表达个性；关键状态颜色全站
一致，避免四款游戏出现四套“成功/危险”含义。

### 字体

- Display：Space Grotesk + 中文系统黑体，用于页面标题与数字；
- Body：Inter + PingFang SC / Microsoft YaHei，用于正文；
- Utility：SF Mono / Cascadia Code，用于 Room 编号、状态与短标签。

实施时优先自托管所需 WOFF2 子集或保证系统字体首帧稳定，不继续把 Google Fonts 成功加载当成布局前提。

### 动效

- 只保留一个主动作：Room 招募信号条的连续扫描；
- 成员加入采用 160–220ms 的局部淡入/位移，不重排整个页面；
- Sheet、toast、按钮 loading 采用短反馈；
- `prefers-reduced-motion` 下去掉位移和持续扫描，但保留静态状态反馈；
- 动画永不阻塞导航和 API 完成。

## 3. 全站手机外壳

```text
┌──────────────────────────┐
│ safe top                 │
│ 机缘 / 当前页面      账号 │  Compact Header
├──────────────────────────┤
│                          │
│ 当前页面内容              │  Route Surface
│                          │
├──────────────────────────┤
│ 摇人       社区       我的 │  Bottom Navigation
│ safe bottom              │
└──────────────────────────┘
```

- 高度使用 `100svh` 基线，局部按 `visualViewport` 渐进调整；
- 顶部和底部使用 `safe-area-inset-*`；
- 底部导航 3 个固定主入口；有效 Room 存在时显示紧凑“回到 Room”状态条，不增加第四个挤压入口；
- 页面内部不再出现 PC 左侧 rail；
- 触控关键目标至少 44×44 CSS px，危险按钮之间保留明确间距；
- 浏览器缩放和 200% 文本放大不能丢失核心动作。

## 4. 手机摇人配置

### 游戏选择

```text
选择游戏

┌──────── Deadlock ───────┐
│ 16:9 主图                │
│ 可用 · PC                │
└─────────────────────────┘

┌ 无畏契约 ┐ ┌ 王者荣耀 ┐
└─────────┘ └──────────┘
┌──────── 三角洲行动 ─────┐
└─────────────────────────┘
```

- 游戏卡来自统一的 public GameDefinition，不再由 `data.js` 私自列出；
- 状态、支持模式和设备来自同一目录；
- 图片使用 `srcset/sizes` 或等价响应式资源；只预加载当前首屏必要图片。

### 配置步骤

```text
‹ Deadlock            2 / 4
位置
选择自己和希望队友的位置

[ 1号位 ] [ 2号位 ]
[ 3号位 ] [ 4号位 ]
[ 5号位 ] [ 6号位 ]

┌─────────────────────────┐
│ 上一步          下一步 → │  Sticky Action Deck
└─────────────────────────┘
```

- 顶部只显示当前游戏与 `当前/总步骤`，不把桌面长步进器硬塞进一行；
- 卡片点击只 patch 当前选中态，不整页 render；
- 最后一步底部主按钮变为“开始匹配”；
- 按钮提交后进入有上限的过场动画，再立即呈现 Room shell；
- Casual 当前规则保持“麦克风 + 偏好人数”，不恢复旧“随缘/速度/满人/更多”。

## 5. 手机 Room（Phase 1 核心）

```text
┌──────────────────────────┐
│ 招募中 · Deadlock    ⋯    │
│ [你] [玩家B] [加入中…] →  │  横向成员条
│ ▬▬▬ 正在寻找合适玩家      │  招募信号
├──────────────────────────┤
│ 游戏 / 目的 / 麦克风   ⌄  │  条件摘要，可展开 Sheet
├──────────────────────────┤
│                          │
│ 聊天消息                  │
│                          │  唯一主要纵向滚动区
│              新消息 ↓     │
├──────────────────────────┤
│ 快捷回复 →                │  横向滚动
│ [说点什么…]        [发送] │  Composer
├──────────────────────────┤
│ [停止招募]       [退出招募]│  Room Actions
│ safe bottom              │
└──────────────────────────┘
```

### 成员

- 1 人：显示“你 + 加入中…”，不画无意义的配对线或完成勾；
- 2–6 人：横向成员条，可滚动但保留当前用户定位；
- 新成员加入只 patch roster，显示一次短暂“加入中…”→成员卡过渡；
- 成员离开只移除该成员并恢复空位，不重建 Room；
- 任意端都必须基于同一 revision 的权威 Room snapshot 收敛，避免 A 看见 B、B 看不见 A。

### 条件

- 默认显示一行摘要；点击展开底部 Sheet；
- Ranked 展示游戏、目的、段位、位置、麦克风；
- Casual 只展示游戏、目的=休闲、麦克风和偏好人数；
- 1 人、2 人、3–6 人使用不同密度，但数据来自同一 member view model；
- 不让条件表长期占据聊天主空间。

### 聊天

- Room shell 先显示 chat skeleton，水合后只替换消息区；
- `minmax(0,1fr) + overflow-y:auto + overscroll-behavior:contain`；
- 用户接近底部时新消息自动跟随；正在看历史时显示“有新消息”，不抢滚动；
- 输入草稿不因 Realtime、键盘、成员变化或 Room hydration 丢失；
- 系统消息、停止招募和拜拜使用明显但统一的消息样式；
- 发送失败保留消息和重试入口。

### 操作

- 1 人招募时不显示“停止招募”；成员加入后显示；
- 停止招募、拜拜均实时显示投票分子/分母；
- 每个 mutation 都有 operation id、loading、重复点击抑制和最终结果；
- 拜拜后“溜了”按既定规则出现；
- 退出前使用底部确认 Sheet，不用浏览器原生弹窗；
- 软键盘打开时主危险动作可收进“更多”Sheet，避免误触，发送区保持可达。

## 6. 断线与恢复体验

```text
页面/网络恢复
→ 验证 Auth
→ resolveActiveRoom / state resolver
→ 拉权威 Room/Session snapshot
→ 对齐 revision
→ 恢复 Realtime
→ Live
```

用户只看到四种明确状态：

- 正在重新连接；
- 已恢复；
- 需要重新登录；
- 这一间 Room 已结束。

不使用 `unload` 代表离开，不使用 `navigator.onLine` 代表事实，不在网络恢复时自动跳进历史 Room。若服务端裁决存在
可恢复 Room，先在 Home 提示“是否回到房间”；拒绝等价于正常离开流程。

## 7. 共享代码边界

```text
Server GameDefinition / public catalog
                 ↓
Shared Browser State + Actions
                 ↓
Page Presentation Models
          ┌──────┴──────┐
          │             │
   Desktop Layout   Mobile Layout
          │             │
          └──────┬──────┘
             Same APIs
```

### 必须共享

- Auth/session；
- Matchmaking input、兼容规则和 ticket；
- Room projection、成员 revision、聊天数据；
- Realtime invalidation；
- Stop-Recruitment、Goodbye、Slip、Exit 操作；
- Resume Eligibility；
- Session/Settlement；
- 埋点与错误分类。

### 可以独立

- 导航布局；
- 游戏选择卡密度；
- 步进器表现；
- Room 成员区排列；
- 条件详情是表格还是 Sheet；
- 操作按钮排布；
- 动画与触控反馈。

### 禁止

- `mobileMatchingState`、`mobileRoomState` 等第二套业务状态；
- 按 UA 复制 Safari/微信业务流程；
- 在手机 renderer 中直接访问数据库或重写兼容规则；
- resize/keyboard 触发 `render()` 和全状态重读；
- 新增手机专属 Room route 作为第二事实源。

## 8. Phase 1 实施切片

### M1｜防回归基线

- 将现有“手机必须被拦截”E2E 改成预期失败测试；
- 新增 360/375/390/412/430 viewport shell 契约；
- 保留 PC 三档和 125% zoom 回归。

### M2｜统一游戏展示目录

- 服务端导出安全 public game catalog；
- 浏览器 Home/Profile/Room/Capacity 不再各自维护游戏名称和步骤；
- Deadlock 行为保持不变，fake game 贯穿浏览器 presentation contract。

### M3｜MobileViewportShell + Navigation

- safe-area token、`svh/dvh` fallback、VisualViewport controller；
- 手机顶部、底部导航、toast/dialog/sheet；
- 不因 viewport 变化重建 route。

### M4｜Hero / Auth / Welcome / Home

- 手机 Hero；
- 登录注册与中文输入法；
- 身份创建；
- 游戏选择和配置步骤；
- 加载、错误、禁用、返回和草稿保留。

### M5｜Mobile Room

- 稳定 Room shell；
- 成员横条和局部 roster patch；
- 条件 Sheet；
- 独立聊天滚动；
- composer 键盘避让；
- 招募/拜拜/退出操作 Deck；
- Realtime 与 hydration 不重挂。

### M6｜Gameover / Me / Connections / Community

- 赛后与反馈；
- 分游戏资料；
- 最近队友/好友/通知/举报/拉黑入口；
- 轻量社区；
- 所有页面具备空、慢、错、重试状态。

### M7｜恢复和真机收尾

- Safari/Chrome/微信的前后台、键盘、系统返回、横竖屏和网络切换；
- 权威恢复协议；
- 性能预算和资源按路由加载；
- reduced-motion、focus-visible、200% 文本。

每个切片必须是可独立回归的 tracer bullet，不做一次“大爆炸式手机版上线”。

## 9. 验收矩阵

| 平台 | 尺寸/重点 |
| --- | --- |
| iPhone Safari | 375 / 390 / 430；safe area、键盘、返回、前后台 |
| Android Chrome | 360 / 412；键盘、系统返回、地址栏、性能 |
| iOS 微信 | 登录返回、键盘、聊天、Realtime、前后台 |
| Android 微信 | 同上，并记录实际 feature support |
| Desktop | 1366×768、1440×900、1920×1080、125% zoom 不回归 |

每个平台至少执行：

```text
登录
→ 选择游戏与配置
→ Room shell
→ 成员加入
→ 双向聊天/快捷消息/系统消息
→ 键盘与聊天滚动
→ 断网/切后台/恢复
→ 停止招募 / 拜拜 / 退出
→ 赛后
→ lifecycle convergence
```

## 10. Phase 1 完成定义

只有同时满足以下条件，Phase 1 才算完成：

1. 触屏手机不再显示 PC-only Gate，所有核心页面可用；
2. PC 与手机共用同一业务状态和 API；
3. Deadlock PC 行为不回归；
4. fake game 能通过统一 catalog 在 PC/手机展示，不复制生命周期；
5. Room 不因键盘、Realtime、成员加入或 hydration 整页闪烁；
6. 聊天独立滚动，输入与操作不被键盘/安全区遮挡；
7. Safari、Chrome、iOS 微信、Android 微信目标矩阵通过；
8. `duplicate=0`、`new ghost=0`、`new active residue=0`；
9. typecheck、tests、build 和新增移动 E2E 全部通过。

完成 Phase 1 后再进入 Phase 2：无畏契约 PC + 手机真实接入。
