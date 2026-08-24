# 机缘当前状态

> 状态快照日期：2026-08-24（Asia/Shanghai）
> 
> 本文件记录当前事实，不是下一轮开发计划。若与旧交接文档冲突，以本文件中的已验证生产证据和当前源码为准。

## 1. 当前阶段

- 当前阶段：Final Private Pilot Gate（`PENDING / NO-GO`）。
- 下一阶段目标：5–10 名真实玩家的 Private Pilot。
- 当前 New P0：`0`。
- 已确认关闭的 P0：`LEGACY_ROOM_DUAL_RENDER_PATH`、`ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`、`REFRESH_PAGEHIDE_FALSE_EXIT`。
- 当前唯一任务：由 03 审核并补齐 Final Private Pilot Gate 剩余 evidence；不得把已关闭 P0 误写成 Final Gate PASS，也不得自动替代 03 给出最终 Gate 结论。
- 本阶段不扩大产品、测试或审计范围；P0 Active Room regression 已完成并通过，后续仅执行 03 明确要求的剩余 Gate 证据。
- 容量验证策略已改为渐进式容量探顶：`5 → 10 → 20 → 30 → 40 → 50 → 75 → 100 → 125 → 150 → 200 → 300 → 400 → 500`；当前工具支持至 `500`，容量结果仍为 `NOT ASSESSED`，不把人数档位本身解释为 FAIL 或 PASS。`capstate500-stage5-0824` 已实际启动 5 人 Stateful 阶段，但因请求超时在阶段完成前停止，未进入后续档位。

## 2. Git 与源码基线

- 仓库：`output/jiyuan-computer-handoff-2026-08-22/project-s-source`
- Canonical engineering branch：`main`。
- Git 当前可信应用源码基线：`40c138c105f55f24e31a481a2067202bec9cd0bf`（`fix: reduce production database read pressure`）。`main` 已将 `agent/ui-shell-production` fast-forward 收敛；此前 `892d61e`、`875bb97` 与 `923bf47` 的产品修复继续保留在当前主线。后续事实文档提交属于 docs-only，不改变该应用发布基线。
- 当前 `main` HEAD：以当前仓库 `git rev-parse HEAD` 为准；本次已部署的应用提交为 `40c138c105f55f24e31a481a2067202bec9cd0bf`，其后追加本次 Production 变更后的事实源同步。
- Project source tracked files：clean；仓库根下既有未跟踪 `output/` 证据目录保留，不能将其误写为不存在。
- `agent/ui-shell-production` 已完成 fast-forward 收敛并保留，不删除该 branch。
- Runtime source baseline、tests/tooling、project docs 与 migration provenance 均已进入 Git。
- `0009_realtime_matchmaking.sql` 已恢复为历史原始版本；当前 migration provenance 规则保持有效：`NOT_RECORDED` 不得解释为未执行，不得 replay 或 repair production migration history，后续数据库变化必须使用 forward-only migration。
- `v0.1` / `v1` / `v2` 仅作为 historical archive，不承担当前项目事实源职责。
- 当前源码 migration 文件数：30。新增 `20260824100000_session_member_likes.sql` 为 forward-only migration；此前审计中使用的“27 个 migration”属于更早时间点，不能继续作为当前仓库总数。

## 3. Production 当前事实

- 公网入口：`https://www.jiyuan.online`
- 部署方式：腾讯云中国香港节点上的 Docker Compose，Caddy 对外提供 HTTPS 和代理。
- 最近 Production source commit：`40c138c105f55f24e31a481a2067202bec9cd0bf`；Production runtime `APP_VERSION` / health label：`40c138c105f55f24e31a481a2067202bec9cd0bf`。此前 `47f3a11`、`923bf47`、`875bb97`、`892d61e`、`cd51a83` 与 `7bee0a2-dirty-presence-2c0143f4` 作为历史部署版本/标签保留。
- Git 应用源码基线与 Production runtime version / deployment label 仍是两个不同概念；本次具备源码同步、容器 build、health、HTTP 与容器状态证据，但不把单独的 health 字段解释为任意容器文件的字节级证明。
- 此前 `875bb97` 发布后的健康检查曾确认：`HTTP 200`、`ok=true`、`status=ready`、`version=875bb9786b5c4c5684de87358cb0289236adc869`、`online=0`、`matching=0`、`playing=0`、`users=531`；检查时间 `2026-08-24T10:17:41.166Z`。这是历史安全收尾快照，不覆盖当前 `40c138c` 发布后的 degraded 诊断证据。
- `923bf47` Health diagnostics 修复发布后的连续 5 次公开烟测均在 `4.046–4.466s` 内返回结构化 `HTTP 503`、`ok=false`、`status=degraded`、`version=923bf470938cd5ab721a0b37a6e39e56fff97395`；`presence` 与 `database` 各自明确记录 `HEALTH_CHECK_TIMEOUT`（单项边界 `2000ms`），不再出现 20 秒无响应。该历史结果只证明 response bound 与 diagnostics 的设计已生效；当前 `40c138c` 的低频观察仍显示底层依赖异常未恢复，5-user rerun 保持 `NOT READY`。
- `capstate500-stage5-0824` 超时后的只读健康检查：`status=ready`、`online=0`、`matching=0`、`playing=0`、`users=531`、`databaseLatencyMs=123857`；检查时间 `2026-08-24T10:38:53.169Z`。该阶段后 app/gateway 容器均无 restart，`OOMKilled=false`；这只是失败后的安全收尾快照，不是 Stateful capacity PASS。
- 先前 `2026-08-24T05:10:45.191Z` 的健康检查仍作为历史快照保留；不同时间点的 `online/users` 数字不得混写。
- Production 应用容器 `china-hk-app-1` 为 `healthy`，Caddy gateway 正常运行；部署构建仅出现 Docker Buildx 未安装警告，未导致失败。
- `40c138c` 发布新增 `/api/health/live` liveness endpoint，monitor 改为每分钟读取 liveness；`/api/health` 改为只读 Presence probe、可 abort 的依赖检查，并由带 7.5 秒短缓存的 `poolSummary()` 支撑 `/api/state`，未改变 Matching、Room/Session lifecycle、Presence heartbeat/TTL/grace、RLS、Realtime 或 migration。
- 本次发布后已完成 13 个低频公开观察样本（约 `2026-08-24T14:22:18Z`–`14:36:43Z`，观察按用户要求中止，未完成完整 15–30 分钟窗口）：`/api/health/live` 全部 HTTP `200`；`/api/health` 全部有界返回 HTTP `503`，约 `4.04–4.21s`，presence/database 均明确记录 `HEALTH_CHECK_TIMEOUT`；`/api/config` HTTP `200`；`/api/pool-summary` 全部 HTTP `200` 但约 `6.27–7.23s`。Caddy error/upstream/504 日志行 `0`（当前 Caddy 配置无 access-log 总量，因此仅记录可观察错误）；app/gateway restart `0`、`OOMKilled=false`，Docker 应用资源未显示瓶颈。
- 本次未取得 A/B/C authenticated browser session；最终低频未认证读取为 `/api/state=401`、`/api/session=200`，不能替代 3/3 authenticated `/api/state`、`/api/session` smoke，后者保持 `NOT VERIFIED`。Production Supabase/DB CPU after 未从 Dashboard 取得；健康依赖持续超时，因此 `SUPABASE RESOURCE PRESSURE=NOT RESOLVED`，5-user rerun 继续 `NOT READY`。
- `20260824100000_session_member_likes.sql` 已按授权在 Production 执行；表、3 个索引、3 个 RLS policy 与 RLS enabled 已只读确认，表内点赞行数为 `0`；未修改历史点赞、旧 `session_responses`、旧 tags 或 migration history。
- 生产前端静态 bundle 已确认包含 Presence heartbeat 客户端标记，说明 Presence 客户端代码已随网站发布。
- 生产数据库 project ref：`chqxaqibegpdjtedrxwx`。
- 生产数据库最近已确认：`pg_cron` 可用；Presence migration 所需字段、函数、trigger、cron job 已存在。发布后只读查询：active ticket `0`、active Session `0`；原始 active Room `1` 与 terminal Session + playing Room `1` 均对应已登记历史 baseline `F1A64`，排除历史 5 个 ghost Room 后 New Active Room `0`、New Ghost `0`、New Active Ticket Residue `0`、New Active Session Residue `0`。

## 4. 已确认的 Production / staging 证据

以下事项有本轮项目历史中明确的生产验收结果，作为 PASS 继承，不因旧交接文档的早期静态描述重新降级：

- Production backup + staging restore：PASS。逻辑备份、custom-format archive、SHA-256、schema / data / roles / migration history / function-trigger / ghost baseline 恢复核对均已有记录。
- Room / Session lifecycle P0 修复：已部署。
- `LEGACY_ROOM_DUAL_RENDER_PATH`：`CLOSED`。Production Active Room regression PASS；canonical bundle 已包含 `sessionPage` / `#/room` guard，旧 `public/js/pages/room.js` URL 已返回 404；03 已正式确认关闭。
- `ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`：`CLOSED`。Terminal Session 与 Room 终态一致性已部署并通过 New Ghost / terminal consistency 证据核对。
- `REFRESH_PAGEHIDE_FALSE_EXIT`：`CLOSED`。Refresh、relogin、Home、Back/Forward 与 direct `#/room` recovery PASS，未触发错误退出或重复业务实体。
- 发布后定向浏览器检查：已登录测试账号无 Active Room 时，直接访问 `#/room` 安全归一至 `#/home`；空 `#/matching` 归一至 `#/home`；未创建业务实体。随后完成的 Active Room 多账号定向回归为 PASS；该回归不等于完整 Final Private Pilot Gate PASS。
- 新 ghost Room：0；历史 5 个 ghost Room 保持不变、未清理。
- Casual 多人 `members[]` 模型：已部署。
- 三账号 Production 匹配进入同一个三人 Session：PASS。
- 三人成员列表和成员信息：PASS。
- 三人普通聊天、快捷消息：PASS。
- Refresh / Active Session recovery：PASS。
- Goodbye `1/3 → 2/3 → 3/3`：PASS。
- Gameover / Feedback：PASS。
- Recent Connections：PASS。
- Re-match：PASS。
- Explicit Leave：PASS。
- 已有数据收敛检查：matching / playing active residue 为 0，且未产生新的 ghost。
- Presence Production migration：已执行；生产 `pg_cron`、Presence heartbeat/offline/reconcile/timeout 相关对象已确认存在。
- 逐成员点赞与连接线修复及本次可访问性/反馈交互修复：代码 baseline `875bb97` 已部署；两人/三人视觉与逐成员点赞的 A/B/C 受控 Production smoke 尚未完成，不能写成 Production QA PASS。

### 不应混淆的证据边界

- 上述“backup + staging restore PASS”是备份恢复 Gate 的证据。
- Presence 专项 staging 时序验证曾因目标环境不是空库且 `pg_cron` 不可用而阻塞；这不改变已通过的生产备份恢复 Gate，也不应被写成 Presence 专项 staging 五项时序全部 PASS。
- 旧交接文档中关于“多人 ready → playing 尚未证实”等描述是更早快照；三账号生产验收已提供更新的主路径证据，但任何新场景仍须遵守当前 Gate 的范围。

## 5. 已知 blocker / 风险

### 当前 Gate 需要保留的未闭合项

- Final Private Pilot Gate：`PENDING / NO-GO`。
- Matching transition Refresh：`PENDING`。
- Matching Back / Forward：`PENDING`。
- Minimum Security：`PENDING`。
- Minimum Observability：`PENDING`。
- Desktop UI 1366×768 / 1440×900 / 1920×1080：`PENDING`。
- 以上是 Gate Evidence 缺口，不是新的 P0；不得把 P0 closure 写成 Final Gate PASS。

### 非阻断但必须保留的事实

- Production health 当前返回 runtime label `40c138c105f55f24e31a481a2067202bec9cd0bf`；该值来自部署环境 release metadata，仍与 Git 应用源码基线的完整 SHA 分开记录。
- 本次无法取得 A/B/C 三个同时受控的已登录 Production 身份，因此“两人/三人 Production 视觉 smoke、逐成员点赞刷新恢复、self/non-member 拒绝”保持 `NOT VERIFIED`；不以单一登录身份或本地 build 证据替代 Production smoke。
- Project source tracked files 当前 clean；仓库根下既有未跟踪 `output/` 证据目录保留。Production deployment label 与 Git 基线分开记录，Production release provenance 仍需结合源码同步、容器 build、health 和静态 bundle 证据理解。
- 三个已登记的 P0 均保持 `CLOSED`；当前不存在新的 P0。后续只按 `Final Private Pilot Gate` 剩余范围补证据。
- 历史 5 个 ghost Room 仍存在，属于已知历史基线，不是本轮新增问题。
- 旧兼容代码和旧 API 仍可能存在；不能仅因为某个字段或 API 存在，就推断其为当前主产品路径。
- Stateful capacity rehearsal 尚未取得有效容量结论：历史 20 人尝试曾分别因 runner 环境兼容错误、Production preflight `playing=2` 和认证阶段 HTTP `429` 停止；本次 `run_id=capstate500-stage5-0824` 在 5 人阶段因 `The operation was aborted due to timeout` 停止，未进入 10 人及以上档位。该阶段未生成结构化 evidence 文件，失败请求的 endpoint、底层 `error.cause` 与完整 mutation ledger 均 `NOT CAPTURED`；不能据此区分 Runner、网络或 App 根因，也不能把本次结果写成容量 FAIL 或 PASS。失败后的健康检查显示 `matching=0`、`playing=0`，但完整 DB integrity 查询与同批账号事后 state 复核未完成，Capacity 结论继续保持 `NOT ASSESSED`。
- 为后续容量验证已在 Production 完成 `run_id=capstate500-0824` 的 500 个专用普通测试账号/身份 provisioning；最终测试 manifest 中 `actors=500`、唯一 `userId=500`，角色分配按当前渐进档位校正为 `ranked=294`、`casual=156`、`fragmented=50`（原始 provisioning manifest 保留）。service role 仅用于受控账号 provisioning，不用于业务动作；provisioning 阶段未执行 Matching、Presence、Room、Realtime、Chat、Goodbye、Leave、Feedback 或 stateful workload。随后 5 个普通账号的 authenticated `/api/state` 与 `/api/session` smoke 为 `PASS`，唯一 user ID 与 user-scoped state 均匹配；这不等于 500 个身份全部 smoke，也不替代已在 5 人阶段超时的 stateful capacity evidence。容量结论仍为 `NOT ASSESSED`。

## 6. 当前不重复执行的工作

以下项目已有 Production PASS，本阶段除非出现新的明确回归，不重新跑完整闭环：

- 登录 → 匹配 → Room → 聊天 → Goodbye → Leave → Feedback → Recent Connections → Re-match 全流程。
- 三人 `members[]`、三人 Goodbye、基础 Refresh / Active Session recovery。
- 新 ghost、matching / playing residue 的完整历史 Gate。

只在 Final Private Pilot Gate 明确要求时执行对应的最小 Refresh attack、Security、Observability 和 Desktop UI 检查。

## 7. 明确禁止

- 不清理历史 5 个 ghost Room。
- 不 replay 缺失的旧 migration，不 repair 生产 migration history。
- 不新增无关 migration、功能或 UI。
- 不扩展 Community、Friends 正式功能、第二款游戏或商业化。
- 不把 P1 / P2 / Public Beta backlog 重新升级为当前 P0。
