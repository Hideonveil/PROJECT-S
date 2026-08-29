# 四游戏 + 手机端正式开放前临时计划

> 状态：`ACTIVE / TEMPORARY`
>
> 生效日期：2026-08-29（Asia/Shanghai）
>
> 事实层级：当前正式开放前的工程计划。若与旧 Private Pilot / Deadlock-only 文档冲突，以本文件和 `DEC-016` 为准。
>
> 删除条件：只有“正式开放 Gate”完整 `PASS` 后才允许删除本文件；部分通过、单游戏通过或仅 200 人压测通过均不满足删除条件。

## 1. 当前战略

- 机缘尚未正式对外开放，当前从开发者视角推进，不为开发中游戏额外建设隐藏入口、Feature Flag 或普通用户提示体系。
- 正式开放版本同时支持四款游戏：`Deadlock`、`无畏契约`、`王者荣耀`、`三角洲行动`。
- 三款新游戏按 `无畏契约 → 王者荣耀 → 三角洲行动` 顺序逐款研究、实现和测试；最终四款一起进入正式开放 Gate。
- 每款游戏都必须同时完成 PC 与手机核心链路，不允许先完成全部桌面版、再复制或重写手机端。
- 手机端与 PC 共用 Auth、Matching、Room、Session、Realtime 和持久化事实；手机端拥有保持机缘视觉语言的竖屏专属展示和交互层，不建立第二套网站或第二套业务状态。
- 最大压力测试在四游戏、手机端和共享网站功能全部完成后执行；开发中间只做每款游戏所需的 10–20 账号 correctness smoke。

## 2. 实施顺序

### Phase 0 — 当前线上事实审计

- 以最新 Production 与 canonical `origin/main` 为起点。
- 识别仍在执行的 Deadlock hardcode、旧 Casual 规则、废弃 Prototype / UI / API 路径和手机端缺口。
- 输出可追踪的改造清单；不把历史聊天或旧计划当作运行事实。

### Phase 1 — 共享游戏扩展边界 + 手机端基础

- 继续使用 `GameDefinition` registry 和游戏规则 adapter；共享编排中不得新增散落的游戏名分支。
- Auth → Ticket → Room → Session → terminal lifecycle、恢复资格、幂等、防重复、聊天和退出一致性保持一套共享实现。
- 建立手机竖屏导航、匹配步骤、Room、成员区、聊天、底部操作、安全区、软键盘和 Realtime 恢复基础组件。
- 同 URL、同 API、同服务端状态；允许 PC / 手机使用不同布局组件，不允许复制领域逻辑。

### Phase 2 — 无畏契约 PC + 手机完整链路

- 先基于当前官方事实研究模式、段位、位置、人数和兼容条件，再落地规则 adapter 与 UI。
- 完成后执行 PC + 手机 10–20 账号全生命周期 correctness smoke。
- 该阶段验证第二款真实游戏能否通过现有扩展边界接入；若仍需复制 Matching / Room / Session，则扩展边界 Gate 不通过。

### Phase 3 — 全站共享功能

- 完成个人资料、分游戏资料、好友、最近队友、再次联系、通知、举报、拉黑、Contact Us、单设备登录、网络恢复和轻量社区。
- PC 与手机同时完成；不扩展为大型内容社区、推荐算法或商业化系统。

### Phase 4 — 王者荣耀 PC + 手机完整链路

- 以手机竖屏为主要体验验收面，同时保持 PC 可用。
- 验证游戏专属段位、位置、队伍人数、Room、聊天、软键盘、网络切换与返回 Room。
- 完成后执行 PC + 手机 10–20 账号全生命周期 correctness smoke。

### Phase 5 — 三角洲行动 PC + 手机完整链路

- 通过规则 adapter 表达模式、队伍人数和玩法偏好差异，不复制第二套 Matcher。
- 验证 Casual 多人 Room 的形成、补人、锁定、退出和终态收敛。
- 完成后执行 PC + 手机 10–20 账号全生命周期 correctness smoke。

### Phase 6 — 四游戏统一收尾

- 四款游戏同时可配置和使用，分游戏资料严格隔离，禁止跨游戏匹配或状态串线。
- PC / 手机状态一致；刷新、重连、聊天、停止招募、拜拜、退出和赛后正确。
- 删除或隔离不再执行的旧规则；不得让兼容路径重新成为第二事实源。
- `duplicate=0`、`new ghost=0`、`new active residue=0`，页面无明显整页闪烁。

### Phase 7 — 最终极限测试

- 使用真实普通 synthetic accounts、多 IP、PC 与手机浏览器尺寸、四游戏混合流量。
- 所有身份从正常登录开始，通过自动匹配进入 Room，不指定匹配对象、不预登录绕过 Auth。
- 梯度：`50 → 100 → 200 → 300 → 500`。
- 覆盖 Matching、Room、Realtime、Presence、Chat、停止招募、拜拜、赛后和终态收敛。
- `200` 是正式开放最低容量线；`300 / 500` 用于寻找余量与真实 breaking point。

## 3. 单游戏进入下一阶段的 Gate

每款新游戏必须通过：

```text
登录
→ 选择游戏
→ 游戏专属配置
→ 自动匹配
→ 双方/多方看到一致成员
→ Room
→ 双向聊天和系统消息
→ 停止招募 / 拜拜 / 退出
→ 赛后
→ lifecycle convergence
```

同时满足：

- PC 与手机目标浏览器通过；
- 10–20 个普通测试账号通过；
- 不发生整页闪烁或跨游戏数据串线；
- `duplicate=0`；
- `new ghost=0`；
- `new active residue=0`。

## 4. 手机端第一版验收矩阵

- iPhone Safari；
- Android Chrome；
- 微信内置浏览器；
- 竖屏宽度 `360 / 375 / 390 / 412 / 430`；
- 横屏保持可用，但不阻塞第一版深度视觉验收；
- 覆盖安全区、软键盘、聊天独立滚动、返回手势、加载、错误、断线和恢复。

## 5. 正式开放 Gate

只有以下全部成立才是 `PASS`：

1. Deadlock、无畏契约、王者荣耀、三角洲行动均通过 PC + 手机完整主链路；
2. 第一版共享网站功能完成；
3. 200 人四游戏混合全链路稳定通过，完整完成人数达到总账号数的 90% 以上；
4. 无持续高 CPU、持续 5xx / timeout、Matching storm、系统性 Realtime / Presence 失败或 restart / OOM；
5. `new duplicate=0`、`new ghost=0`、`new active residue=0`，无 lifecycle corruption；
6. Gate 证据、Production 版本和最终事实已写入 `CURRENT_STATE.md` 与 `CHANGELOG.md`。

`300 / 500` 用于容量余量和 breaking point；若 200 稳定而更高档首次降级，是否阻止开放由当时真实风险决定，不自动推翻 200 人 Gate。

## 6. Gate PASS 后的退休步骤

Gate 完整 `PASS` 后允许且应当：

1. 将四游戏、手机端、共享功能和容量结果的最终事实写入 `docs/project/CURRENT_STATE.md`；
2. 将正式开放版本、验证证据和已知限制写入 `docs/project/CHANGELOG.md`；
3. 将 `DEC-016` 状态改为 `RETIRED / GATE PASSED`，保留一行历史原因；
4. 删除本文件 `docs/project/PRELAUNCH_FOUR_GAME_MOBILE_PLAN.md`；
5. 删除 `CURRENT_STATE.md`、`BACKLOG.md` 和其他文档中指向本临时计划的活动引用；
6. 后续只维护最终产品规则、真实 Backlog 和正式容量事实，不继续保留已完成的实施路线。

Gate 未完整 PASS 时禁止为了“文档整洁”提前删除本计划。
