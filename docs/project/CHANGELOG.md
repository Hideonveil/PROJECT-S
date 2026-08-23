# 机缘 Production Changelog

> 只记录已经影响 Production、或已完成 Production 验收的事件。测试中的本地改动、未部署方案和未授权修复不写入本表。

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
