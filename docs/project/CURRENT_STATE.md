# 机缘当前状态

> 状态快照日期：2026-08-23（Asia/Shanghai）
> 
> 本文件记录当前事实，不是下一轮开发计划。若与旧交接文档冲突，以本文件中的已验证生产证据和当前源码为准。

## 1. 当前阶段

- 当前阶段：Final Private Pilot Gate（`PENDING / NO-GO`）。
- 下一阶段目标：5–10 名真实玩家的 Private Pilot。
- 当前 New P0：`0`。
- 已确认关闭的 P0：`LEGACY_ROOM_DUAL_RENDER_PATH`、`ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`、`REFRESH_PAGEHIDE_FALSE_EXIT`。
- 当前唯一任务：由 03 审核并补齐 Final Private Pilot Gate 剩余 evidence；不得把已关闭 P0 误写成 Final Gate PASS，也不得自动替代 03 给出最终 Gate 结论。
- 本阶段不扩大产品、测试或审计范围；P0 Active Room regression 已完成并通过，后续仅执行 03 明确要求的剩余 Gate 证据。

## 2. Git 与源码基线

- 仓库：`output/jiyuan-computer-handoff-2026-08-22/project-s-source`
- Canonical engineering branch：`main`。
- Git 当前可信源码基线：`cd51a831cf4435ceb03c10740cf5c0e2b80aeef0`（`fix: unify active room session renderer`）。`main` 已将 `agent/ui-shell-production` fast-forward 收敛到此前基线；本次前端 P0 修复已在 `main` 提交并部署。
- Project source working tree：clean。
- `agent/ui-shell-production` 已完成 fast-forward 收敛并保留，不删除该 branch。
- Runtime source baseline、tests/tooling、project docs 与 migration provenance 均已进入 Git。
- `0009_realtime_matchmaking.sql` 已恢复为历史原始版本；当前 migration provenance 规则保持有效：`NOT_RECORDED` 不得解释为未执行，不得 replay 或 repair production migration history，后续数据库变化必须使用 forward-only migration。
- `v0.1` / `v1` / `v2` 仅作为 historical archive，不承担当前项目事实源职责。
- 当前源码 migration 文件数：29。此前审计中使用的“27 个 migration”属于更早时间点，不能继续作为当前仓库总数。

## 3. Production 当前事实

- 公网入口：`https://www.jiyuan.online`
- 部署方式：腾讯云中国香港节点上的 Docker Compose，Caddy 对外提供 HTTPS 和代理。
- 最近 Production runtime version / deployed candidate：`cd51a831cf4435ceb03c10740cf5c0e2b80aeef0`；runtime deployment label / `/api/health.version` 为 `cd51a83`；此前 `7bee0a2-dirty-presence-2c0143f4` 作为历史部署标签保留。
- Git 当前可信源码基线与 Production deployment label 仍是两个不同概念；本次有源码同步、容器 build、health 与静态 bundle 证据，但不把 `/api/health.version` 单独解释为容器字节级证明。
- 最近生产 `/api/health` 已确认：`ok=true`、`status=ready`、`version=cd51a83`、`online=2`、`matching=0`、`playing=0`、`users=29`。
- 该次健康检查时间：`2026-08-23T14:06:06.683Z`。
- 本次发布后的 `version` 已由部署时 `APP_VERSION` 标记为 `cd51a83`；release metadata 的自动化追踪仍保留在 backlog，不扩大为本轮产品改动。
- 生产前端静态 bundle 已确认包含 Presence heartbeat 客户端标记，说明 Presence 客户端代码已随网站发布。
- 生产数据库 project ref：`chqxaqibegpdjtedrxwx`。
- 生产数据库最近已确认：`pg_cron` 可用；Presence migration 所需字段、函数、trigger、cron job 已存在；执行前 active / playing / connecting / ready Session 均为 0。

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

- Production health 当前返回 `version=cd51a83`，但该值来自部署环境标记；仍不能单独作为容器字节级一致性证明。
- Project source working tree 当前 clean；Production deployment label 与 Git 基线分开记录，Production release provenance 仍需结合源码同步、容器 build、health 和静态 bundle 证据理解。
- 三个已登记的 P0 均保持 `CLOSED`；当前不存在新的 P0。后续只按 `Final Private Pilot Gate` 剩余范围补证据。
- 历史 5 个 ghost Room 仍存在，属于已知历史基线，不是本轮新增问题。
- 旧兼容代码和旧 API 仍可能存在；不能仅因为某个字段或 API 存在，就推断其为当前主产品路径。

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
