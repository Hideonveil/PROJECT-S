# 机缘 Production Changelog

> 只记录已经影响 Production、或已完成 Production 验收的事件。测试中的本地改动、未部署方案和未授权修复不写入本表。

## 2026-08-25 — terminal room_members fix + 5-user stateful rerun

- 新增 forward-only migration `20260825160000_terminalize_room_members_on_terminal.sql`，并以 `220b993` 部署 Production。Session/Room 进入 terminal 时，所有仍为 `active` 的 `room_members` 一起变为 `exited`，写入 `exited_at`；不做历史 backfill、不执行 raw SQL 清理。
- `capstate500-terminalized-20260825` 从既有 `capstate500-0824` pool 复用 5 个普通 synthetic identities，完成 `2 Ranked + 3 Casual` 的 Login、Presence、Matching、Pair/Group、Room/Session、Realtime、Chat、Refresh、Reconnect、Goodbye、Feedback 与 lifecycle convergence。Runner stage 5 PASS，identity isolation PASS。
- Production 只读核验：2 rooms、2 sessions 均 `completed`；5/5 新建 `room_members` 均 `status=exited`，5/5 `exited_at` 非空，`active_member_rows=0`。`NEW GHOST=0`、`NEW ACTIVE RESIDUE=0`、`NEW DUPLICATE=0`。旧 completed room 中的历史 active residue 未清理，继续冻结。
- lifecycle ledger 共 125 条，error/HTTP 5xx/timeout/conflict/rollback action 均为 0；4 条消息均送达预期收件人。期间 app CPU 采样峰值约 `29.50%`、gateway 约 `1.29%`，未观察到 restart/OOM。
- Supabase DB CPU/RAM/connections 图表仍无法加载，DB CPU baseline/peak/final、rollback rate、reservation conflict rate 未取得。因此 terminalization fix 与 5-user lifecycle 收敛为 PASS，但 `RESERVATION STORM FIX=FIX DEPLOYED / PENDING LOAD VERIFICATION`，`10-USER READINESS=NOT READY`。
- Evidence：`output/capacity-validation/capstate500-terminalized-20260825/`。Registry 仍不保存密码、token 或 service role。

## 2026-08-25 — capstate500 reuse 5-user stateful verification

- 从已识别的 `capstate500-0824` 500-account pool 复用 5 个普通 synthetic identities；5 个
  user_id distinct，普通 Auth 登录与 identity isolation preflight 均 PASS。另有 1 个 fallback
  registration probe 保留为未验证、未用于业务行为的 synthetic account；registry 不含任何密码或 token。
- `capstate500-reuse-20260825` 完成 `2 Ranked + 3 Casual`：Login、Presence、Matching、
  Pair/Group、Room/Session、Realtime、Chat、Refresh、Reconnect、Goodbye、Feedback 与最终
  state 均有 evidence。Runner stage 5 PASS；125 条 lifecycle entries 中 122 个 HTTP 200、
  error/timeout/conflict/rollback action 均为 0；消息 4/4 收件人完整，Realtime 14 次订阅与
  14 次关闭均正常。
- 本轮只读 DB 核对：两房、两 session 均 `completed`，但 5 条本轮新建 `room_members` 仍为
  `status=active`，记录为 `NEW ACTIVE RESIDUE=5`；不执行 raw SQL 清理。`NEW GHOST=0`、
  `NEW DUPLICATE=0`（以本轮 runner/最终状态证据为准）。
- Supabase Observability 本轮 CPU/RAM/connections 图表均返回 `Unable to load data`，因此
  DB CPU baseline/peak/final、DB RAM、connections、rollback rate 不能宣称已测得。远端 app/
  gateway 资源采样未见接近危险区；Production health 最终为 `200 ready`，database/presence
  checks 成功，`matching=3`、`playing=2` 未新增。
- 结论：`5-USER STATEFUL=INCONCLUSIVE`（功能 runner PASS，但 lifecycle residue 与 DB 指标缺口
  阻止整体 PASS）；`RESERVATION STORM FIX=NOT VERIFIED`；`10-USER READINESS=NOT READY`。
- 本轮未修改代码、未部署、未执行 migration、未迁库、未 raw SQL 清理；evidence 位于
  `output/capacity-validation/capstate500-reuse-20260825/`。

## 2026-08-25 — Repository consolidation and current production fact correction

- 唯一 canonical repository 已收敛到 `/Users/jasonhu/Documents/ChatGPT/project/JY_source`；旧 `PROJECT-S` 工作区已移除，旧 UI/spec 通过 archive ref 保留，未 merge legacy API/JS/room implementation。
- 建立无秘密 synthetic account registry：`docs/project/SYNTHETIC_ACCOUNT_REGISTRY.md`。账号 provisioning 与普通用户身份的业务行为分离；registry 不保存 password、access token、refresh token、service role 或 Authorization header。
- 当前事实修正为 `REAL PRODUCTION USERS=0`。`matching=3` / `playing=2` 对应 `CAP001`–`CAP005` synthetic capacity identities，归类为 `SYNTHETIC RESIDUE / TEST GHOST CANDIDATE`；历史实体 ID 冻结，不执行 SQL 删除或更新。
- 当前 DB CPU 为 `NORMAL`（idle/read-only snapshot）；`MATCHMAKING_RESERVATION_ROLLBACK_STORM` 更新为 `FIX DEPLOYED / PENDING LOAD VERIFICATION`，stateful matching 根行为仍未验证，P0 不关闭。
- 追加只读 Production health 核验：`2026-08-25T05:07:16.730Z` 返回 `200 ready`、runtime `1454bd4`、`online=0`、`matching=3`、`playing=2`、`users=531`；presence/database checks 成功。该快照不替代逐实体 inventory 或 stateful load verification。

## 2026-08-25 — Stateful Runner load-amplification fix deployed; 5-user preflight held

- Git application baseline `1454bd49a91b70fb592c97ff1c4675dd8f046625` 已 fast-forward 推送到 `origin/main`，并按腾讯云中国香港 Docker Compose 正式流程部署；Production `/api/health/live` 返回 `200`、`/api/health` 返回 `200 ready`，runtime health version 为 `1454bd4`，app healthy、gateway running、restart `0`、未观察到 OOM。
- Production forward-only migration `20260825150000_separate_presence_heartbeat_from_reconcile.sql` 已在 Supabase SQL Editor 成功执行一次；仅将 stale reconciliation 从 `presence_heartbeat()` 移出，保留 10 秒 heartbeat、30 秒 effective-online、180 秒 reconnect grace 与现有 `pg_cron` stale sweep；未 replay/repair migration history，未修改历史业务数据。
- 部署后远端 host/container 与 Supabase Dashboard 快照未显示资源危险信号：host CPU idle `90.9%`、app `0.00%`、gateway `1.00%`；Supabase Project Healthy、compute `micro / t3a.micro`、CPU `2%`、RAM `33%`、connections `6/100`。这些是部署后 idle/read-only 快照，不是 capacity PASS。
- 5-user 尚未执行。Health 显示 `matching=3`、`playing=2`，只读核对确认其对应 `CAP001`–`CAP005` 专用测试账号；当前本地五个 stateful credential 低频 Auth smoke 均为 `HTTP 401`，因此按安全边界保持 preflight `NOT READY`，避免在 active test records 未收敛且身份认证失败时发起业务 mutation。
- Final Private Pilot Gate 继续 `PENDING / NO-GO`；`JIY-P0-004 MATCHMAKING_RESERVATION_ROLLBACK_STORM` 不因本次部署或 idle 快照自动关闭。

## 2026-08-25 — Reservation conflict structured-result release

- 应用 commit：`8972b1e134328bded364523a7ffab862316c93ea`，已 fast-forward 推送至 `origin/main`，并按腾讯云中国香港 Docker Compose 正式流程同步和部署；Production health version 返回同一完整 SHA。
- 新增 forward-only migration：`20260825130000_return_reservation_conflicts.sql`；已在 Production Supabase SQL Editor 执行一次。Pair/Group reservation 的预期业务冲突改为结构化 JSON 返回，保留真实数据库 serialization failure 的异常语义；routine 执行权限只保留 `postgres` / `service_role`。
- 未 replay 历史 migration、未 repair `schema_migrations`、未修改历史业务数据；未改变 Matching、Presence、Room/Session lifecycle 或 Realtime 产品规则。
- 部署后只读 smoke：`/api/health/live` `5/5=200`；`/api/health` `3/3=200 ready`；`/api/config=200`；根路径既有 `307`；health presence/database checks 成功。Production 当前 `matching=3`、`playing=2`，未触碰这些既有活动。
- Supabase Dashboard 仍显示 high CPU usage banner；本次未取得部署后 DB CPU/rollback delta，因此 `MATCHMAKING_RESERVATION_ROLLBACK_STORM` 保持 `FIX_IN_PROGRESS`，5-user rerun 保持 `NOT READY`。本次未执行 stateful capacity 或 Final Gate。

## 2026-08-25 — RLS auth initplan 优化已执行并部署

- 新增 forward-only migration：`20260825110000_optimize_rls_initplan.sql`；Production 已执行，未修改 schema、业务数据或历史 migration history。
- 仅重建 `profiles_insert_own`、`profiles_update_own`、`profiles_select_own`、`sessions_select_participant` 四条 policy，将 `auth.uid()` 包装为 `(select auth.uid())`；roles、commands、USING/WITH CHECK 与 participant predicate 保持不变，未使用 `auth.jwt()`。
- Production 只读 identity isolation：本人 profile 可见 `1`、他人 profile 可见 `0`；participant session 目标行 `1`；non-participant session 目标行 `0`。测试均在 `authenticated` role 的回滚事务中执行，无业务写入。
- Supabase Performance Advisor 重跑：`0 errors / 0 warnings / 38 suggestions`；当前 `auth_rls_initplan` 未再显示。该结果不等于数据库 CPU incident 已解决。
- Git 工程基线：`347c0bb`（包含 migration、测试及本事实源同步）；应用已按腾讯云中国香港 Docker Compose 流程部署，Production runtime `APP_VERSION=347c0bb`。
- 部署后 smoke：`/api/health/live=200`、`/api/health=200 ready`、`/api/config=200`；`china-hk-app-1=healthy`、gateway=`running`、restart `0`、OOM `false`。health 当前仍显示 `matching=3`、`playing=2`，未执行 5-user rehearsal；rollback storm / DB CPU 事故仍未因本次 RLS 优化而关闭。

## 2026-08-25 — Reservation conflict guard 发布（Production 归因未闭合）

- 应用 commit：`8631311`，`fix: bound matchmaking reservation conflicts`；已通过腾讯云中国香港 Docker Compose 流程同步并部署，Production `/api/health/live` 与 `/api/health` runtime label 均为 `8631311`，`china-hk-app-1` 为 `Healthy`、gateway 为 `Running`。
- 修复范围：同一用户匹配 mutation single-flight；`matchmaking_start_ticket` 返回 `reused` 时不重复进入候选匹配；Pair/Group 业务 reservation conflict 每次流程最多 4 次；不同候选之间使用短 backoff+jitter；新增 stdout 分钟级 reserve attempts / pair conflicts / group conflicts 观测。未修改 Matching 规则、Room/Session lifecycle、Presence 语义、RPC、schema 或 migration。
- 部署前证据：DB CPU 约 `91%`；PostgREST transaction setup `528,970 / 5min`；rollback `528,989 / 5min`（约 `1,690/sec`）；日志含 `MATCH_RESERVATION_CONFLICT` / `GROUP_RESERVATION_CONFLICT`。
- 部署后低频观察约 `10` 分钟：10/10 次 liveness/readiness 成功，presence/database checks 均成功；未见 5xx/timeout、container restart 或 OOM；app CPU `0–0.02%`、内存约 `48.8–53.1MiB`，gateway CPU `0%`。观察期间 `matching=3`、`playing=2` 始终存在，未执行 5-user 或清理活动实体。
- 只读 `pg_stat_statements` 约 60 秒前后显示 Pair reserve `612,505 → 612,505`、Group reserve `643,304 → 643,304`，本窗口未见新的 reserve RPC 增长；但全库 `xact_rollback` 仍约 `1,775/sec` 增长。Supabase CPU 图表无法加载，DB CPU after 未验证；因此本次只能确认 reserve 应用路径已加界，不能宣布 rollback storm 或 Supabase resource pressure 已解决。
- Migration：`NO`。Production data/schema/migration history：未修改。5-user rerun：`NOT READY`；`10-user readiness：NOT READY`。

## 2026-08-24 — Database CPU cleanup Phase 1 发布

- 应用发布源 commit：`40c138c105f55f24e31a481a2067202bec9cd0bf`，Production runtime `APP_VERSION` / health label：`40c138c105f55f24e31a481a2067202bec9cd0bf`；已通过腾讯云中国香港 Docker Compose 流程同步并部署，`china-hk-app-1` 为 `healthy`，gateway 为 `running`。
- 新增 `/api/health/live`，monitor 改为 liveness；`/api/health` 不再调用 `presence_reconcile_stale()`，依赖检查使用只读 probe、独立 abort timeout 与总体 deadline；`/api/state` 改用带 7.5 秒短缓存的 `poolSummary()`，目录读取与统计读取分离。
- 部署前：定向测试通过；完整测试 `44 files / 228 tests PASS`；TypeScript `PASS`；Next build `PASS`；`git diff --check PASS`。未执行 migration，未修改 Production schema/data，未执行 stateful workload。
- 发布后已完成 13 个低频公开观察样本（约 `2026-08-24T14:22:18Z`–`14:36:43Z`，按用户要求提前停止，未完成完整 15–30 分钟窗口）：`/api/health/live=200`；`/api/health=503` 且均在约 `4.04–4.21s` 内有界返回，presence/database 各记录 `HEALTH_CHECK_TIMEOUT`；`/api/config=200`；`/api/pool-summary=200` 但约 `6.27–7.23s`。Caddy 可观察 error/upstream/504 行为 `0`；app/gateway restart `0`、`OOMKilled=false`，容器资源未显示瓶颈。
- 结论：`SUPABASE RESOURCE PRESSURE=NOT RESOLVED`。本次修复确认 liveness、health response bound、首页重型 health polling 移除和 state read 复用代码已部署，但 Supabase/DB 只读检查仍持续超时；DB CPU after 未取得 Dashboard 证据，不能宣称资源压力已消除。5-user rerun 保持 `NOT READY`。
- 当前未取得 A/B/C authenticated session；低频未认证结果为 `/api/state=401`、`/api/session=200`，3/3 authenticated read smoke 保持 `NOT VERIFIED`。Final Private Pilot Gate 继续 `PENDING / NO-GO`。

## 2026-08-24 — `/api/health` 可诊断性与超时边界修复发布

- Git application release baseline：`923bf470938cd5ab721a0b37a6e39e56fff97395`，`fix: bound and diagnose health checks`；已按腾讯云中国香港 Docker Compose 流程部署，`china-hk-app-1` 与 `china-hk-gateway-1` 均保持运行，restart `0`、OOM `false`。
- `/api/health` 连续 5 次公开烟测均在 `4.046–4.466s` 内返回 HTTP `503`、`ok=false`、`status=degraded`，响应包含总 `requestId`、每个 `presence` / `database` check 的 request ID、开始时间、耗时、超时状态与 sanitized error cause；`/api/health.version` 返回 `923bf470938cd5ab721a0b37a6e39e56fff97395`。
- 两个外部依赖检查均在各自 `2000ms` 边界超时；该发布将历史约 20 秒无响应收敛为有界、可诊断的 degraded 响应，但未宣称 Supabase/DB 依赖已经恢复。`/api/config` HTTP `200`；根路径跟随既有 `307` 后 HTTP `200`。
- 本次未执行 migration、未修改数据库 schema、未修改 Production 业务数据；5-user Stateful rerun 仍为 `NOT READY`，Final Private Pilot Gate 继续保持 `PENDING / NO-GO`。

## 2026-08-24 — Stateful Capacity 5 人阶段停止（证据未形成容量结论）

- `run_id=capstate500-stage5-0824` 已按授权启动 5 人 Stateful rehearsal；runner 在阶段完成前报错 `The operation was aborted due to timeout`，因此按停止条件未继续 10/20/30/40/50/75/100/125/150/200/300/400/500 档位。
- 本次失败阶段未生成结构化 evidence 文件；失败请求的 endpoint、identity、底层 `error.cause`、完整 API metrics 与 mutation ledger 为 `NOT CAPTURED`，不能事后推测根因或把结果分类为 App/Network/Runner。
- 超时后的只读健康检查（`2026-08-24T10:38:53.169Z`）为 `status=ready`、`online=0`、`matching=0`、`playing=0`、`users=531`、`databaseLatencyMs=123857`。app 与 Caddy 容器均保持运行，restart `0`、OOM `false`；近 15 分钟 Caddy 容器日志无新增输出。该快照只证明未观察到 matching/playing 残留，不等于完整 capacity PASS。
- 应用日志在同一时间窗出现 `server_error` / `server_error_persist_failed`（`code=INTERNAL_ERROR`、`error_name=UnknownError`，业务上下文字段为 `null`）；由于 runner 阶段起止时间和请求关联未完整保存，不能将这些日志逐请求归因于本次阶段。
- 未执行 migration、未部署应用、未执行 SQL 清理或手工修改 Production 数据；本次确实尝试了普通测试身份的正常业务请求，部分 mutation 是否在超时前完成缺少完整 ledger。后续容量结论保持 `NOT ASSESSED`，不得把本次尝试写成 PASS 或 Production 容量 FAIL。

## 2026-08-24 — Stateful Capacity 专用账号 provisioning（前置准备）

- `run_id=capstate500-0824`；Production 已按授权准备 500 个专用普通测试身份，最终测试 manifest 中 `actors=500`、唯一 `userId=500`；角色分配按当前渐进档位校正为 `ranked=294`、`casual=156`、`fragmented=50`，原始 provisioning manifest 保留。
- service role 仅用于受控 Auth/profile provisioning；在 provisioning 阶段未作为普通 Actor 执行业务动作，也未执行 Matching、Presence、Room、Realtime、Chat、Goodbye、Leave、Feedback 或 stateful workload。后续 5 人 stateful 阶段另见本表顶部记录。
- provisioning 前置与收尾健康检查均保持 `status=ready`、`matching=0`、`playing=0`；收尾检查时间 `2026-08-24T10:17:41.166Z`，Production runtime version `875bb9786b5c4c5684de87358cb0289236adc869`，`users=531`。
- 未修改 schema、未执行 migration、未部署应用、未执行业务数据清理；随后 5 个账号的 authenticated `/api/state` 与 `/api/session` identity smoke 已通过，但不代表 500 个身份全部验证，因此容量结果仍为 `NOT ASSESSED`。

## 2026-08-24 — 可访问性与反馈交互修复发布

- Git application release baseline：`875bb9786b5c4c5684de87358cb0289236adc869`，`fix: improve session accessibility and feedback interactions`；`origin/main` 已同步到该 commit。
- 已按中国香港 Docker Compose 正式流程部署；`china-hk-app-1` 为 `healthy`，Caddy gateway 正常运行；Docker build 完成并生成 35/35 static pages。
- Production health：HTTP `200`、`ok=true`、`status=ready`、`version=875bb9786b5c4c5684de87358cb0289236adc869`、`online=2`、`matching=0`、`playing=0`、`users=29`；`/api/config` HTTP `200`；根路径 HTTP `307`；旧 `/js/pages/room.js` HTTP `404`；检查时间 `2026-08-24T05:10:45.191Z`。
- 本次未执行 migration，未修改 Production 数据、历史数据或 migration history；本次 commit 相对 `892d61e` 无 migration 文件变化。
- 两人/三人视觉与逐成员点赞的 A/B/C 受控 Production smoke 尚未完成，保持 `NOT VERIFIED`。Final Private Pilot Gate 继续保持 `PENDING / NO-GO`，不写成 Production QA PASS。

## 2026-08-24 — 逐成员点赞与连接线修复发布

- Git application release baseline：`892d61e6eea1e3d3a1802d341b1ec4cd1013eb23`，`fix: bridge session fit lines between names`；`origin/main` 已同步到该 baseline，随后只追加本次事实文档提交。
- 已按中国香港 Docker Compose 正式流程部署；`china-hk-app-1` 为 `healthy`，Caddy gateway 正常运行。
- Production health：HTTP `200`、`ok=true`、`status=ready`、`version=892d61e6eea1e3d3a1802d341b1ec4cd1013eb23`、`online=1`、`matching=0`、`users=29`；检查时间 `2026-08-24T03:01:44.867Z`；根路径 HTTP `307` 为既有重定向。
- Production migration：`20260824100000_session_member_likes.sql` 已执行；表、约束、3 个索引、RLS enabled、3 个 policy 已只读确认；表内点赞行数 `0`；未修改历史数据、旧点赞字段/tags 或 `schema_migrations`。
- 发布后只读数据检查：active ticket `0`、active Session `0`；原始 active Room `1` 与 terminal Session + playing Room `1` 对应已登记历史 baseline `F1A64`；排除历史 5 个 ghost Room 后 New Ghost `0`、New Active Ticket Residue `0`、New Active Session Residue `0`、New Active Room `0`。
- 本轮未完成 A/B/C 受控身份的 Production smoke：两人/三人视觉、逐成员点赞刷新恢复、取消隔离、self/non-member 拒绝均为 `NOT VERIFIED`。因此 Final Private Pilot Gate 继续保持 `PENDING / NO-GO`，不写成 Production QA PASS。
- 未执行：旧 migration replay、migration history repair、历史 ghost 清理、历史业务数据修改；Production data rows modified = `NO`。

## 2026-08-23 — Active Session 双渲染路径 P0 发布与关闭

- Git baseline：`cd51a831cf4435ceb03c10740cf5c0e2b80aeef0`，`fix: unify active room session renderer`。
- 已按中国香港 Docker Compose 流程发布；应用镜像 build 成功，`china-hk-app-1` healthy，gateway 保持运行。
- Production runtime version / deployed candidate：`cd51a831cf4435ceb03c10740cf5c0e2b80aeef0`；runtime deployment label 为 `cd51a83`。两者分别记录，不将 deployment label 单独解释为容器字节级证明。
- `/api/health`：`ok=true`、`status=ready`、`version=cd51a83`、`online=2`、`matching=0`、`playing=0`、`users=29`；检查时间 `2026-08-23T14:06:06.683Z`。
- Production 静态 bundle 已确认导出 canonical `sessionPage`、`#/room` guard 与 `replaceCanonicalRoute`；旧 `public/js/pages/room.js` 已移除并返回 404。
- Active Room 定向回归 PASS：正常匹配、Refresh、重新登录恢复、Home 恢复、Back/Forward、直接 `#/room`、Realtime hydration、Chat、Goodbye `1/3 → 2/3 → 3/3`、Explicit Leave、Completed、Feedback；三端未出现 `.room-page`，Duplicate = `0`、New Ghost = `0`、New Active Residue = `0`。
- `LEGACY_ROOM_DUAL_RENDER_PATH`、`ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`、`REFRESH_PAGEHIDE_FALSE_EXIT`：均为 `P0 CLOSED`；Current New P0 = `0`。
- Final Private Pilot Gate：`PENDING / NO-GO`，不因上述 P0 closure 变为 Gate PASS。剩余 evidence：Matching transition Refresh、Matching Back / Forward、Minimum Security、Minimum Observability、Desktop UI 三视口。
- 未执行：数据库写入、migration、migration history repair、历史 ghost 清理；上述三个 P0 closure 不代表执行了新的数据库或历史数据操作。

## 2026-08-23 — Presence / Online / Offline 发布

- 数据库执行：`20260823100000_presence_reconnect_grace.sql`。
- 生产身份与部署前 active Session Gate 通过；执行时 active / playing / connecting / ready Session 为 0。
- 生产已确认：`pg_cron` 可用，`room_members.disconnected_at` 存在，Presence heartbeat / offline / stale reconcile / timeout 相关函数存在，Presence trigger 和 cron job 已注册。
- 行为目标：10 秒 heartbeat、30 秒 effective-online TTL、180 秒 Room reconnect grace；Presence 离线不立即取消已建立 Room / Session。
- 未执行：migration history repair、旧 migration replay、历史 ghost Room 清理、历史业务数据批量修改。

## 2026-08-23 — Presence 代码发布

- 生产代码部署标签：`7bee0a2-dirty-presence-2c0143f4`。
- 通过腾讯云中国香港 OrcaTerm / Docker Compose 发布；app 与 gateway 健康。
- `/api/health` 已确认 `ok=true`、`status=ready`，当时 `online=0`、`matching=0`、`playing=0`、`users=29`。
- 生产静态 JavaScript 已确认包含 Presence heartbeat 客户端代码。
- 备注：健康接口的 `version` 仍返回 `unknown`，因此本条使用部署标签作为发布标识，版本元数据缺口进入 backlog。

## 2026-08-22 — Production Backup Gate

- 完成生产逻辑备份及 custom-format archive 产物。
- 备份包括 roles、schema、data、Auth users、migration history、目标 function / trigger、5 个历史 ghost baseline、row counts / samples 和 SHA-256。
- 在独立 staging / temporary restore target 中完成实际恢复和对账，Backup Gate = PASS。
- 备份目录：`output/p0-production-backup-20260822T162015Z`。

## 2026-08-22 — Room / Session lifecycle P0 修复

- 部署 migration：`20260822210000_sync_room_with_terminal_session.sql`。
- Session terminal lifecycle 统一同步 Room terminal 状态：cancelled → cancelled，completed → completed。
- `phase1_exit_room` / `phase1_finalize_session` 不再承担重复的 Room 终态更新；未新增 `rooms → sessions` 反向 trigger。
- 未清理既有 5 个历史 ghost Room；部署后新 ghost = 0，terminal Session + playing Room invariant 保持为 0。

## 2026-08-22 — 多人 Session / Refresh 修复生产验收

- Casual Group / Room / Session 的 `members[]` 模型已部署。
- 三账号 Production 匹配进入同一个三人 Session：PASS。
- 三人成员展示、普通聊天、快捷消息：PASS。
- Refresh / Active Session recovery：PASS；刷新或离开页面返回不会创建重复 Room / Session，也不会把成员错误带回首页。
- Goodbye：真实经历 `1/3 → 2/3 → 3/3`，并完成 Session：PASS。
- Gameover / Feedback：PASS。
- Recent Connections：PASS。
- Re-match：PASS。
- Explicit Leave：PASS；Room / Session 状态按既定取消语义收敛。
- 测试后新 ghost、active matching / playing residue：0。

## 2026-08-22 — 历史基线

- 生产部署前已记录 5 个历史 ghost Room ID 集合；后续部署验证均以该集合为排除基线。
- 生产 migration history 与仓库文件历史存在差异；项目决策是先做 schema / object reconciliation，不盲目 replay 或 repair history。
