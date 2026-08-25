# 机缘当前状态

> 状态快照日期：2026-08-25（Asia/Shanghai）
> 
> 本文件记录当前事实，不是下一轮开发计划。若与旧交接文档冲突，以本文件中的已验证生产证据和当前源码为准。

> 2026-08-25 治理修正：唯一 canonical root 为
> `/Users/jasonhu/Documents/ChatGPT/project/JY_source`。`REAL PRODUCTION USERS = 0`；当前
> health 的 `users=531` 是 profiles/account 总数，不代表真实用户已正式开放。当前
> `matching=3 / playing=2` 已知来自 `CAP001`–`CAP005` synthetic capacity identities，
> 但其实体生命周期尚未完成正常 API 收敛核验，因此暂分类为 `SYNTHETIC RESIDUE / TEST
> GHOST CANDIDATE`，不执行 raw SQL 清理。

## 1. 当前阶段

- 当前阶段：Final Private Pilot Gate（`PENDING / NO-GO`）。
- 下一阶段目标：5–10 名真实玩家的 Private Pilot。
- 当前 New P0：`1`（`MATCHMAKING_RESERVATION_ROLLBACK_STORM`，修复后仍待 Production 归因与收敛验证）。
- 已确认关闭的 P0：`LEGACY_ROOM_DUAL_RENDER_PATH`、`ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`、`REFRESH_PAGEHIDE_FALSE_EXIT`。
- 当前唯一任务：由 03 审核并补齐 Final Private Pilot Gate 剩余 evidence；不得把已关闭 P0 误写成 Final Gate PASS，也不得自动替代 03 给出最终 Gate 结论。
- 本阶段不扩大产品、测试或审计范围；P0 Active Room regression 已完成并通过，后续仅执行 03 明确要求的剩余 Gate 证据。
- 容量验证策略已改为渐进式容量探顶：`5 → 10 → 20 → 30 → 40 → 50 → 75 → 100 → 125 → 150 → 200 → 300 → 400 → 500`；当前工具支持至 `500`，容量结果仍为 `NOT ASSESSED`，不把人数档位本身解释为 FAIL 或 PASS。`capstate500-stage5-0824` 已实际启动 5 人 Stateful 阶段，但因请求超时在阶段完成前停止，未进入后续档位。

## 2. Git 与源码基线

- 仓库：`/Users/jasonhu/Documents/ChatGPT/project/JY_source`
- Canonical engineering branch：`main`。
- Git 当前可信工程基线：`1454bd49a91b70fb592c97ff1c4675dd8f046625`；该 commit 已推送 `origin/main` 并按正式腾讯云 Docker Compose 流程部署 Production。此前 `2e269f2`、`892d61e`、`875bb97` 与 `923bf47` 的产品修复继续保留在当前主线。
- 本次 `main` 应用基线 `8972b1e` 已推送 `origin/main` 并完成 Production 发布；Production runtime 与 Git 应用基线分别记录，不把后续 docs-only commit 混同为已部署应用字节版本。
- Project source tracked files：clean；仓库根下既有未跟踪 `output/` 证据目录保留，不能将其误写为不存在。
- `agent/ui-shell-production` 已完成 fast-forward 收敛并保留，不删除该 branch。
- Runtime source baseline、tests/tooling、project docs 与 migration provenance 均已进入 Git。
- `0009_realtime_matchmaking.sql` 已恢复为历史原始版本；当前 migration provenance 规则保持有效：`NOT_RECORDED` 不得解释为未执行，不得 replay 或 repair production migration history，后续数据库变化必须使用 forward-only migration。
- `v0.1` / `v1` / `v2` 仅作为 historical archive，不承担当前项目事实源职责。
- 当前源码 migration 文件数：34。新增 `20260824100000_session_member_likes.sql`、`20260825110000_optimize_rls_initplan.sql`、`20260825130000_return_reservation_conflicts.sql` 与 `20260825150000_separate_presence_heartbeat_from_reconcile.sql` 均为 forward-only migration；此前审计中使用的“27 个 migration”属于更早时间点，不能继续作为当前仓库总数。
- 本轮新增工程修复 commit：`2e269f2c6e1c580afe0b3c0a4fe013a95fcd1b52`，并由 docs-only commit `1454bd4` 固化事实。它将 Stateful Runner 的同一 Actor `/api/state` 读取做 in-flight 合并、将等待轮询默认间隔从 1 秒调整为约 2 秒并加入轻微 jitter，同时防止 heartbeat 请求重叠；该修复已随 `1454bd4` 部署 Production。
- 本轮新增 forward-only migration：`20260825150000_separate_presence_heartbeat_from_reconcile.sql`，SHA-256 为 `d3014accb511b75a53a1f94e0c93423b328e393dc80abe576def2eb88b5b7fd8`。已在 Production Supabase SQL Editor 成功执行一次；它只移除 `presence_heartbeat()` 内对 `presence_reconcile_stale()` 的调用，保留 heartbeat、30 秒 effective-online、180 秒 reconnect grace 及 `pg_cron` stale sweep；未 replay/repair migration history。

## 3. Production 当前事实

- 公网入口：`https://www.jiyuan.online`
- 部署方式：腾讯云中国香港节点上的 Docker Compose，Caddy 对外提供 HTTPS 和代理。
- 最近 Production application source commit：`1454bd49a91b70fb592c97ff1c4675dd8f046625`；Production runtime health version：`1454bd4`。此前 `8972b1e`、`347c0bb`、`8631311`、`40c138c`、`47f3a11`、`923bf47`、`875bb97`、`892d61e`、`cd51a83` 与 `7bee0a2-dirty-presence-2c0143f4` 作为历史部署版本/标签保留。
- Git 应用源码基线与 Production runtime version / deployment label 仍是两个不同概念；本次具备源码同步、容器 build、health、HTTP 与容器状态证据，但不把单独的 health 字段解释为任意容器文件的字节级证明。
- 此前 `875bb97` 发布后的健康检查曾确认：`HTTP 200`、`ok=true`、`status=ready`、`version=875bb9786b5c4c5684de87358cb0289236adc869`、`online=0`、`matching=0`、`playing=0`、`users=531`；检查时间 `2026-08-24T10:17:41.166Z`。这是历史安全收尾快照，不覆盖当前 `40c138c` 发布后的 degraded 诊断证据。
- `923bf47` Health diagnostics 修复发布后的连续 5 次公开烟测均在 `4.046–4.466s` 内返回结构化 `HTTP 503`、`ok=false`、`status=degraded`、`version=923bf470938cd5ab721a0b37a6e39e56fff97395`；`presence` 与 `database` 各自明确记录 `HEALTH_CHECK_TIMEOUT`（单项边界 `2000ms`），不再出现 20 秒无响应。该历史结果只证明 response bound 与 diagnostics 的设计已生效；此前 `40c138c` 观察到的底层依赖异常和本次 `8631311` 的 rollback 证据分别按各自时间窗口记录，5-user rerun 保持 `NOT READY`。
- `capstate500-stage5-0824` 超时后的只读健康检查：`status=ready`、`online=0`、`matching=0`、`playing=0`、`users=531`、`databaseLatencyMs=123857`；检查时间 `2026-08-24T10:38:53.169Z`。该阶段后 app/gateway 容器均无 restart，`OOMKilled=false`；这只是失败后的安全收尾快照，不是 Stateful capacity PASS。
- 先前 `2026-08-24T05:10:45.191Z` 的健康检查仍作为历史快照保留；不同时间点的 `online/users` 数字不得混写。
- Production 应用容器 `china-hk-app-1` 为 `healthy`，Caddy gateway 正常运行；部署构建仅出现 Docker Buildx 未安装警告，未导致失败。
- 当前 Production DB CPU：`NORMAL`（最近已保存的 idle/read-only 快照约 `2%`）；该快照不是 stateful load evidence。`MATCHMAKING_RESERVATION_ROLLBACK_STORM` 状态更新为 `FIX DEPLOYED / PENDING LOAD VERIFICATION`，stateful matching workload 下的根行为仍 `NOT YET VERIFIED`。
- `40c138c` 发布新增 `/api/health/live` liveness endpoint，monitor 改为每分钟读取 liveness；`/api/health` 改为只读 Presence probe、可 abort 的依赖检查，并由带 7.5 秒短缓存的 `poolSummary()` 支撑 `/api/state`，未改变 Matching、Room/Session lifecycle、Presence heartbeat/TTL/grace、RLS、Realtime 或 migration。
- 本次发布后已完成 13 个低频公开观察样本（约 `2026-08-24T14:22:18Z`–`14:36:43Z`，观察按用户要求中止，未完成完整 15–30 分钟窗口）：`/api/health/live` 全部 HTTP `200`；`/api/health` 全部有界返回 HTTP `503`，约 `4.04–4.21s`，presence/database 均明确记录 `HEALTH_CHECK_TIMEOUT`；`/api/config` HTTP `200`；`/api/pool-summary` 全部 HTTP `200` 但约 `6.27–7.23s`。Caddy error/upstream/504 日志行 `0`（当前 Caddy 配置无 access-log 总量，因此仅记录可观察错误）；app/gateway restart `0`、`OOMKilled=false`，Docker 应用资源未显示瓶颈。
- 本次未取得 A/B/C authenticated browser session；最终低频未认证读取为 `/api/state=401`、`/api/session=200`，不能替代 3/3 authenticated `/api/state`、`/api/session` smoke，后者保持 `NOT VERIFIED`。Production health/idle 快照显示 CPU 已恢复正常，但没有 stateful load 下的 DB CPU/rollback delta，因此不得把 storm 写成已修复或 P0 CLOSED。
- `20260824100000_session_member_likes.sql` 已按授权在 Production 执行；表、3 个索引、3 个 RLS policy 与 RLS enabled 已只读确认，表内点赞行数为 `0`；未修改历史点赞、旧 `session_responses`、旧 tags 或 migration history。
- `20260825110000_optimize_rls_initplan.sql` 已按授权在 Production 执行并随 `347c0bb` 部署；四条 RLS policy 已只读确认改为 `(select auth.uid())`，roles/commands/USING/WITH CHECK 与 participant visibility 保持不变。Production identity isolation read-only verification：own profile `1`、other profile `0`、participant session `1`、non-participant session `0`。Performance Advisor 重跑为 `0 errors / 0 warnings / 38 suggestions`，但 DB CPU after 尚未取得，不能据此宣称 CPU incident 已解决。部署后 liveness/readiness/config 均为 `200`，app healthy、gateway running、restart/OOM 为 `0`；当前 matching/playing 为 `3/2`，5-user rerun 仍未启动。
- `8972b1e` 已按腾讯云中国香港 Docker Compose 正式流程发布；Production smoke：`/api/health/live` 连续 `5/5` 为 `200`，`/api/health` 连续 `3/3` 为 `200 ready`，`/api/config=200`，根路径既有 `307` 重定向；health version 为完整 `8972b1e`，presence/database checks 均成功。观察时 health 显示 `matching=3`、`playing=2`，这些既有 Production 活动未被本次 smoke 修改或清理。
- `20260825130000_return_reservation_conflicts.sql` 已在 Production Supabase SQL Editor 执行一次；只读核对确认 Pair/Group reservation 函数均支持结构化业务冲突返回，且不再主动以业务冲突抛出 SQLSTATE `40001`；routine 执行权限仅保留 `postgres` / `service_role`。未 replay/repair migration history，未修改历史业务数据。
- 本次发布只读 smoke 未执行 Matching、Room/Session、Chat、Goodbye、Leave、Feedback 或容量负载。历史事故窗口曾出现 Supabase high CPU usage banner；最近 idle/read-only 快照为 CPU `2%`，但尚未取得 stateful load 下 DB CPU/rollback delta，因此 `MATCHMAKING_RESERVATION_ROLLBACK_STORM` 为 `FIX DEPLOYED / PENDING LOAD VERIFICATION`，不得写成 P0 CLOSED，5-user rerun 仍 `NOT READY`。
- `1454bd4` 部署后公开 smoke：`/api/health/live=200`、`/api/health=200 ready`，health version 为 `1454bd4`；health 当时返回 `matching=3`、`playing=2`、`users=531`，这 5 个 active ticket 对应的 profiles 昵称为 `CAP001`–`CAP005`，已确认属于专用测试账号而非未知真实玩家。`REAL PRODUCTION USERS=0`；因此当前实体的 real-user collision risk 暂按 `NONE` 处理，但历史测试实体的生命周期原因仍需正常 API/reconciliation 证据确认。腾讯云 app 容器 `healthy`、gateway `running`、restart `0`、OOM 未观察到；远端 host snapshot load average `0.08/0.40/0.24`、CPU idle `90.9%`，容器 app `0.00%` / gateway `1.00%`。Supabase Dashboard 同窗口显示 Project Healthy、compute `micro / t3a.micro`、CPU `2%`、RAM `33%`、connections `6/100`；该快照不是 5-user capacity evidence。
- 最新公开只读 health（`2026-08-25T05:07:16.730Z`）仍为 `/api/health/live=200`、`/api/health=200 ready`，runtime `1454bd4`，`online=0`、`matching=3`、`playing=2`、`users=531`；presence/database checks 均成功。该 endpoint 不返回逐实体 identity inventory，也不返回 DB CPU；最近已保存的 idle/read-only DB CPU `2%` 仍不是 stateful capacity evidence。
- Presence migration 与应用修复已部署，但新的 5-user 尚未启动：现有 `CAP001`–`CAP005` active records 仍未通过正常 API 收敛，且现有本地 5 个 stateful credential 在低频 Auth smoke 中均返回 `HTTP 401`。账号数量不是 blocker；本轮实际 blocker 是无法用已失效 session 安全执行正常 lifecycle 收敛，因此 5-user preflight 仍为 `NOT READY`，未执行 Matching/Room/Chat/Goodbye/Leave/Feedback。
- 生产前端静态 bundle 已确认包含 Presence heartbeat 客户端标记，说明 Presence 客户端代码已随网站发布。
- 生产数据库 project ref：`chqxaqibegpdjtedrxwx`。
- 历史生产数据库快照曾确认：`pg_cron` 可用；Presence migration 所需字段、函数、trigger、cron job 已存在；当时 active ticket `0`、active Session `0`，原始 active Room `1` 与 terminal Session + playing Room `1` 均对应已登记历史 baseline `F1A64`，排除历史 5 个 ghost Room 后 New Active Room `0`、New Ghost `0`、New Active Ticket Residue `0`、New Active Session Residue `0`。本次新部署观察时 health 显示 `matching=3`、`playing=2`，不能沿用该历史零值作为当前 preflight。
- `8631311` 已按腾讯云中国香港 Docker Compose 流程部署；`/api/health/live` 与 `/api/health` runtime label 均为 `8631311`，`china-hk-app-1` 为 `Healthy`、gateway 为 `Running`。未执行 migration、未修改 Production 数据或 schema。
- Reservation storm 修复：原始窗口 DB CPU 约 `91%`、PostgREST transaction setup `528,970 / 5min`、rollback `528,989 / 5min`（约 `1,690/sec`），并伴随 `MATCH_RESERVATION_CONFLICT` / `GROUP_RESERVATION_CONFLICT`。代码新增 per-user matchmaking single-flight、active-ticket reused guard、每次流程最多 `4` 个业务冲突 reserve 尝试、25ms 基线加 jitter 的候选切换退避，以及 stdout 分钟级 `reserve_attempts` / pair/group conflict 计数；未修改 RPC、schema 或 migration。
- 发布后低频观察约 `10` 分钟（`2026-08-24T17:27:01Z`–`17:36:30Z`，另有 `17:37:49Z` 最终 health）：10/10 次 `health/live` 与 readiness 成功，presence/database checks 均成功，未见 5xx/timeout；app CPU `0–0.02%`、内存约 `48.8–53.1MiB`，gateway CPU `0%`、内存约 `18.9–19.5MiB`，无 restart/OOM。观察期间 `matching=3`、`playing=2` 始终存在，未执行 5-user，也未清理这些活动状态。
- 只读 `pg_stat_statements` 约 60 秒前后：Pair reserve calls `612,505 → 612,505`，Group reserve calls `643,304 → 643,304`，本观察窗口未见新的 reserve RPC 增长；但 `pg_stat_database.xact_rollback` `314,779,825 → 314,890,889`（约 62.6 秒，约 `1,775/sec`）仍增长。Supabase Dashboard CPU/connection/IO 图表返回 `Unable to load data`，DB CPU after 未取得，不能宣称全库 rollback/CPU incident 已解决。

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

- 历史 Production health 曾返回 runtime label `8631311`；当前最近已验证的 Production runtime 为 `8972b1e`。这些 deployment label 来自部署环境 release metadata，仍与 Git 当前工程基线的完整 SHA 分开记录。
- 本次无法取得 A/B/C 三个同时受控的已登录 Production 身份，因此“两人/三人 Production 视觉 smoke、逐成员点赞刷新恢复、self/non-member 拒绝”保持 `NOT VERIFIED`；不以单一登录身份或本地 build 证据替代 Production smoke。
- Project source tracked files 当前 clean；仓库根下既有未跟踪 `output/` 证据目录保留。Production deployment label 与 Git 基线分开记录，Production release provenance 仍需结合源码同步、容器 build、health 和静态 bundle 证据理解。
- 三个历史 P0 均保持 `CLOSED`；新增 `MATCHMAKING_RESERVATION_ROLLBACK_STORM` 当前为 `FIX DEPLOYED / PENDING LOAD VERIFICATION`，不因 idle CPU 正常而关闭。下一次 5-user stateful rerun 是验证测试；不得把本次部署或低频 readiness 观察写成容量 PASS。
- 历史 5 个 ghost Room 仍存在，属于已知历史基线，不是本轮新增问题。
- 旧兼容代码和旧 API 仍可能存在；不能仅因为某个字段或 API 存在，就推断其为当前主产品路径。
- Stateful capacity rehearsal 尚未取得有效容量结论：历史 20 人尝试曾分别因 runner 环境兼容错误、Production preflight `playing=2` 和认证阶段 HTTP `429` 停止；本次 `run_id=capstate500-stage5-0824` 在 5 人阶段因 `The operation was aborted due to timeout` 停止，未进入 10 人及以上档位。该阶段未生成结构化 evidence 文件，失败请求的 endpoint、底层 `error.cause` 与完整 mutation ledger 均 `NOT CAPTURED`；不能据此区分 Runner、网络或 App 根因，也不能把本次结果写成容量 FAIL 或 PASS。失败后的健康检查显示 `matching=0`、`playing=0`，但完整 DB integrity 查询与同批账号事后 state 复核未完成，Capacity 结论继续保持 `NOT ASSESSED`。
- 本轮只读代码归因已确认 5-user 的请求放大机制：5 个 Actor 并发启动；`waitForRooms()` 最多每秒并发刷新 5 个 `/api/state`；`waitForTerminal()` 还会继续轮询；每次 `/api/state` 又会触发多组状态、统计、目录和关系读取。当前 forward-only migration 已将 `presence_reconcile_stale(p_now, 200)` 从 `presence_heartbeat()` 移出，由 `pg_cron` 执行 stale sweep。该代码链解释了历史“5 个测试账号造成远高于 5 个真人的数据库负载”，但历史 `capstate500-stage5-0824` 缺少逐请求 ledger 与同窗口 DB 指标，Production 精确 stateful CPU 归因仍未闭合。
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
