# 机缘 Production Changelog

> 只记录已经影响 Production、或已完成 Production 验收的事件。测试中的本地改动、未部署方案和未授权修复不写入本表。

## 2026-08-24 — Stateful Capacity 专用账号 provisioning（前置准备）

- `run_id=capstate500-0824`；Production 已按授权准备 500 个专用普通测试身份，最终测试 manifest 中 `actors=500`、唯一 `userId=500`；角色分配按当前渐进档位校正为 `ranked=294`、`casual=156`、`fragmented=50`，原始 provisioning manifest 保留。
- service role 仅用于受控 Auth/profile provisioning；未作为普通 Actor 执行任何业务动作。未执行 Matching、Presence、Room、Realtime、Chat、Goodbye、Leave、Feedback 或 stateful workload。
- provisioning 前置与收尾健康检查均保持 `status=ready`、`matching=0`、`playing=0`；收尾检查时间 `2026-08-24T10:17:41.166Z`，Production runtime version `875bb9786b5c4c5684de87358cb0289236adc869`，`users=531`。
- 未修改 schema、未执行 migration、未部署应用、未执行业务数据清理；authenticated identity isolation smoke 为 `NOT RUN`，因此容量结果仍为 `NOT ASSESSED`。

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
