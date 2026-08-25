# 机缘统一 Issue Register

> 本文件是机缘项目已发现问题、风险与 Gate Evidence 状态的统一事实源。
> 它不替代 `CURRENT_STATE.md`、`BACKLOG.md`、`DECISIONS.md` 或
> `MIGRATION_PROVENANCE.md`。

## Register Metadata

- Canonical repository: `/Users/jasonhu/Documents/ChatGPT/project/JY_source`
- Canonical branch: `main`
- Created: `2026-08-23`
- Register status: ACTIVE
- Evidence rule: 只登记有明确项目证据支持的问题、风险或 Gate 缺口；缺失证据不得写成已确认缺陷。
- Scope rule: `ISSUES.md` 记录已发现的问题、风险和验证缺口；未来功能、优化、产品需求和技术债规划继续记录在 `BACKLOG.md`。
- Production rule: 默认不修改 Production；任何 Production write、migration、cleanup 或历史数据修改都需要明确授权。
- Current user fact: `REAL PRODUCTION USERS = 0`；health 的 `users=531` 是 profiles/account 总数，不得当作真实用户数。
- Current entity fact: `matching=3`、`playing=2` 对应 `CAP001`–`CAP005` synthetic capacity identities；在生命周期证据完成前分类为 `SYNTHETIC RESIDUE / TEST GHOST CANDIDATE`，不执行 raw SQL 清理。
- Migration rule: 已提交 migration 不改写；新数据库变化必须 forward-only；未登记或不可 replay 的 migration 不自动执行、不 repair history。

## Ownership and Decision Rights

- **03｜QA 与上线负责人**：负责 Severity、QA Evidence、PASS/FAIL/CLOSED 状态。
- **02｜技术负责人**：负责 Root Cause、技术风险、Fix Strategy。
- **01｜产品负责人**：负责 User Impact、Acceptance、Priority input。
- **00｜项目总负责人**：负责跨负责人冲突、阶段阻塞和最终优先级决策。
- **ENG-00**：负责实际代码修改、测试、部署和证据提交；不得自行把 P1/P2 升级为 P0，或自行宣布 Gate PASS。

## Fixed Vocabulary

### Severity

- `P0`：当前阶段 Blocker，例如核心流程中断、数据一致性破坏、严重权限问题、新 ghost、严重安全问题。
- `P1`：已确认问题，但当前不阻塞 Private Pilot。
- `P2`：UX、Polish、低风险技术债或其他低优先级问题。
- `HIST`：历史 baseline 记录，使用 `JIY-HIST-*` 编号；不自动表示当前 Open P0。
- `GATE`：Gate Evidence 记录，不因证据尚未完成而自动成为 P0。

### Status

Issue status 只能使用：

`NEW` · `INVESTIGATING` · `CONFIRMED` · `FIX_IN_PROGRESS` · `READY_FOR_QA` · `PRODUCTION_QA_PENDING` · `CLOSED` · `DEFERRED` · `WONT_FIX`

Gate Evidence 额外允许：`PENDING` · `PASS` · `FAIL`。

`PENDING EVIDENCE` 不等于 P0。只有实际证据证明存在 P0 问题，才能登记为 P0。

## Index

| ID | Title | Severity | Status |
|---|---|---:|---|
| JIY-P0-001 | `LEGACY_ROOM_DUAL_RENDER_PATH` | P0 | CLOSED |
| JIY-P0-002 | `ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST` | P0 | CLOSED |
| JIY-P0-003 | `REFRESH_PAGEHIDE_FALSE_EXIT` | P0 | CLOSED |
| JIY-P0-004 | `MATCHMAKING_RESERVATION_ROLLBACK_STORM` | P0 | FIX_IN_PROGRESS |
| JIY-P1-001 | `DEPLOYMENT_STALE_FILE_RSYNC_HYGIENE` | P1 | CONFIRMED |
| JIY-P1-002 | `LEGACY_RLS_SURFACE_PROVENANCE_GAP` | P1 | PRODUCTION_QA_PENDING |
| JIY-P1-003 | `REALTIME_RECONNECT_STALE_STATE_RESILIENCE` | P1 | INVESTIGATING |
| JIY-P1-004 | `PRESENCE_ABNORMAL_CLOSE_STALENESS` | P1 | PRODUCTION_QA_PENDING |
| JIY-P1-005 | `OPS_AUTH_RATE_LIMITING_GAP` | P1 | CONFIRMED |
| JIY-P2-001 | `MIGRATION_DOCUMENTATION_CONSTRAINT_DRIFT` | P2 | CONFIRMED |
| JIY-HIST-001 | `HISTORICAL_GHOST_ROOMS_BASELINE` | HIST / P1 baseline | DEFERRED |
| JIY-GATE-001 | `FINAL_PRIVATE_PILOT_GATE_EVIDENCE` | GATE | PENDING |
| JIY-GATE-002 | `PROGRESSIVE_STATEFUL_CAPACITY_VALIDATION` | GATE | PENDING |

---

## P0 Issues

### JIY-P0-004 — `MATCHMAKING_RESERVATION_ROLLBACK_STORM`

- **Severity:** P0
- **Status:** FIX_IN_PROGRESS
- **Owner:** ENG-00｜机缘主工程；03｜QA 与上线负责人审核 Production closure evidence
- **Found date:** 2026-08-25
- **Affected area:** Production matchmaking reservation；`src/lib/matchmaking/service.ts`、`matchmaking_reserve_pair`、`matchmaking_reserve_group_member`
- **Impact:** 历史窗口出现 DB CPU 约 `91%`、PostgREST transaction setup `528,970 / 5min`、rollback `528,989 / 5min`（约 `1,690/sec`），并伴随 Pair/Group reservation conflict；该行为仍需 stateful 5-user workload 验证。
- **Pilot impact:** P0 仍未关闭；当前 idle CPU 已恢复正常，但在 stateful load 下 CPU/rollback/conflict/latency/convergence 未验证前，不得把本问题标记为 RESOLVED。
- **Evidence:** 既有 Production 日志/统计窗口；原始部署前 runtime 为 `40c138c`。此前 `pg_stat_statements` 约 60 秒窗口 Pair reserve `612,505 → 612,505`、Group reserve `643,304 → 643,304`，但 `pg_stat_database.xact_rollback` `314,779,825 → 314,890,889`（约 `1,775/sec`）；Supabase Dashboard CPU/connection/IO 图表曾返回 `Unable to load data`。本次 `8972b1e` 部署后 health smoke 为 live `5/5=200`、readiness `3/3=200 ready`，但尚未取得新的 DB CPU/rollback delta。
- **Root cause:** Reservation conflict storm 的应用放大机制已确认；5-user Runner 曾有独立的读取/Presence 放大链。forward-only migration 已将 stale reconciliation 从 heartbeat 移出，但全库 rollback/CPU 在 stateful workload 下的最终 Production 归因仍 `UNKNOWN`；历史失败 run 缺少同窗口逐请求和 DB 指标。
- **Fix / Decision:** `8972b1e` 保留 reservation conflict 结构化返回；`2e269f2` / `1454bd4` 已降低 Runner 的 state-read、polling 与 heartbeat 放大。新增工程修复 commit `220b993` 与 forward-only migration `20260825160000_terminalize_room_members_on_terminal.sql`：Session/Room 进入 terminal 时，将仍为 `active` 的成员更新为 `exited` 并写入 `exited_at`；不做历史 backfill、不删除历史数据。未改变 Matching、Room/Session terminal 规则或历史 residue。
- **Verification:** 定向 terminalization contract `3 files / 16 tests PASS`；完整 `48 files / 249 tests PASS`；TypeScript PASS；Next build PASS（38/38 static pages）；`git diff --check` PASS。Migration 已在 Production Supabase SQL Editor 执行，session/room triggers 与 helper 已只读确认。`220b993` `/api/health=200 ready`，app/gateway 运行正常。
- **Latest stateful verification:** `capstate500-terminalized-20260825` 复用 5 个普通 synthetic accounts，runner stage 5（`2 Ranked + 3 Casual`）PASS；125 条 lifecycle entries 中 125 条无 error、无 HTTP 5xx、无 timeout/conflict/rollback action，4 条消息全部到达预期收件人，Realtime、refresh、reconnect、goodbye、最终 state 均通过。只读 DB 核对确认两房两 session 均 `completed`，5 条新建 `room_members` 全部 `status=exited` 且 `exited_at` 非空，`active_member_rows=0`；`NEW GHOST=0`、`NEW ACTIVE RESIDUE=0`、`NEW DUPLICATE=0`。
- **Production status:** `FIX_IN_PROGRESS`；runtime health version `220b993`，Git full SHA `220b9939903b5ee6200fd794129aa526c84da15f`。Production business data manually modified `NO`；本轮 migration executed `YES`（forward-only terminal member transition）；历史 migration history modified `NO`。旧 completed-room active residues未做 raw SQL 清理，继续冻结为历史基线。
- **Next action:** 补齐可观测的 Supabase DB CPU/RAM/connections 与 rollback/reservation counters；只有在 stateful load 指标验证通过后，才由 03 决定本 P0 closure 和 10-user readiness。room_members terminalization fix 本身已通过本轮新 room/session 验证。
- **Closed date:** UNKNOWN

### JIY-P0-001 — `LEGACY_ROOM_DUAL_RENDER_PATH`

- **Severity:** P0
- **Status:** CLOSED
- **Owner:** 03｜QA 与上线负责人
- **Found date:** 2026-08-23
- **Affected area:** Production Active Room；`#/room`、matching/recovery 路由、Session renderer
- **Impact:** 同一个 Active Room / Session 曾可能进入旧 `roomPage()` 与新版 `sessionPage()` 两套渲染路径，造成界面事实与服务端状态不一致的风险。
- **Pilot impact:** 已关闭；本次回归未观察到 Pilot blocker。
- **Evidence:**
  - Production 已部署 candidate `cd51a831cf4435ceb03c10740cf5c0e2b80aeef0`，runtime deployment label 为 `cd51a83`。
  - Active Room regression PASS：正常匹配、Refresh、重新登录恢复、Home 恢复、Back/Forward、直接 `#/room`、Realtime hydration、Chat、Goodbye `1/3 → 2/3 → 3/3`、Explicit Leave、Completed、Feedback。
  - 三端未出现 `.room-page`；所有 Active Room 入口统一为 `#/room` + `sessionPage(state)`。
  - Duplicate Ticket / Room / Session = `0`；New Ghost = `0`；New Active Residue = `0`。
  - 证据包：`output/final-private-pilot-gate-2026-08-23/P0_ACTIVE_ROOM_PRODUCTION_REGRESSION_ADDENDUM.md`。
- **Root cause:** 前端同时存在 legacy `roomPage()` 与新版 Session renderer 的 Active Room 入口。
- **Fix / Decision:** `cd51a831` 统一 `#/room` → `sessionPage(state)`，统一 Active-state recovery，删除旧 `public/js/pages/room.js` 运行时 renderer；路由归一只读取状态并导航，不创建或终结业务实体。
- **Verification:** Active Room Production Regression PASS；03 已正式判定本 P0 `CLOSED`。
- **Production status:** CLOSED。Production deployment label 与 Git baseline 是两个不同概念；本条不声称 Production 容器与某个 Git commit 字节级一致。
- **Next action:** 无；后续 Gate 仅按 `JIY-GATE-001` 的剩余证据范围执行。
- **Closed date:** 2026-08-23

### JIY-P0-002 — `ROOM_SESSION_TERMINAL_LIFECYCLE_GHOST`

- **Severity:** P0
- **Status:** CLOSED
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Room / Session terminal lifecycle；Room 与 Session 状态一致性
- **Impact:** Session 进入 terminal 后若 Room 仍保留 playing/active 语义，会产生生命周期 ghost、错误恢复或 active residue。
- **Pilot impact:** 已关闭；当前质量指标要求 New Ghost = `0`、New Active Residue = `0`。
- **Evidence:** `DECISIONS.md` DEC-003；`CHANGELOG.md` 2026-08-22 terminal consistency 记录；`20260822210000_sync_room_with_terminal_session.sql` 已有执行证据；后续 Production 只读检查未发现新的非 baseline ghost 或 active residue。
- **Root cause:** Room 与 terminal Session 的状态同步约束曾不完整。
- **Fix / Decision:** 采用 terminal Session → Room terminal consistency；不 replay 历史 migration，不 repair migration history。
- **Verification:** 当前 terminal consistency 证据、New Ghost = `0`、New Active Residue = `0`。
- **Production status:** CLOSED；历史 5 个 ghost Room 单独登记为 `JIY-HIST-001`，不得计入 New Ghost。
- **Next action:** 继续按既有只读数据检查规则观察新 ghost 与 active residue。
- **Closed date:** 2026-08-22

### JIY-P0-003 — `REFRESH_PAGEHIDE_FALSE_EXIT`

- **Severity:** P0
- **Status:** CLOSED
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Refresh、`pagehide`、Active Session recovery、业务退出命令
- **Impact:** 页面生命周期事件若被误判为离开，可能错误触发 Leave、Cancel、Goodbye 或 Complete。
- **Pilot impact:** 已关闭；当前 Active Room 回归未发现 false exit 或由 Refresh 产生的重复业务实体。
- **Evidence:** `DECISIONS.md` DEC-001/DEC-002；`CHANGELOG.md` 2026-08-22 Refresh / Active Session recovery PASS；`P0_ACTIVE_ROOM_PRODUCTION_REGRESSION_ADDENDUM.md` 中 Refresh、relogin、Home、Back/Forward 与 direct `#/room` PASS。
- **Root cause:** 历史 page lifecycle 与业务终结语义存在误绑定；更细的原始实现根因 `NOT RECORDED`。
- **Fix / Decision:** Refresh 不等于 Leave；仅 Explicit Leave 触发退出；Active-state recovery 只执行状态读取与 UI 恢复。
- **Verification:** Refresh 后保持同一 Room / Session；未触发 Leave、Cancel、Goodbye、Complete；Duplicate = `0`、New Ghost = `0`、New Active Residue = `0`。
- **Production status:** CLOSED。
- **Next action:** 无新增修复；若未来出现 regression，仅对受影响入口做 risk-based regression。
- **Closed date:** 2026-08-23

## P1 Issues

### JIY-P1-001 — `DEPLOYMENT_STALE_FILE_RSYNC_HYGIENE`

- **Severity:** P1
- **Status:** CONFIRMED
- **Owner:** ENG-00
- **Found date:** 2026-08-23
- **Affected area:** Production static asset deployment、rsync stale-file hygiene
- **Impact:** 删除的旧前端文件可能因远端 stale file 未被清理而继续被访问，导致 Production 继续提供旧 renderer 或旧资源。
- **Pilot impact:** NON-BLOCKING；当前 candidate deployment 已人工精确清除 stale file 并通过静态 404 检查。
- **Evidence:** candidate deployment 记录显示 rsync 后远端曾保留旧 `/public/js/pages/room.js`；随后进行了人工精确清除、重建/重启，并确认 `/js/pages/room.js` 返回 404。
- **Root cause:** 当前部署流程的远端 stale-file 清理与验证策略不足；精确实现根因 `NOT RECORDED`。
- **Fix / Decision:** 本任务不修复。后续部署前必须采用已批准的 stale-asset 清理策略或逐项静态资源验证。
- **Verification:** 当前 Production candidate 的旧 `room.js` 已不再可访问；流程问题仍 OPEN。
- **Production status:** 当前部署已清理；issue 仍为部署流程风险。
- **Next action:** 由 02/ENG-00 在下一次部署流程变更中定义并验证 stale-file hygiene；不得在本任务顺手修复。
- **Closed date:** UNKNOWN

### JIY-P1-002 — `LEGACY_RLS_SURFACE_PROVENANCE_GAP`

- **Severity:** P1
- **Status:** PRODUCTION_QA_PENDING
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Supabase RLS、legacy matchmaking 表与权限策略、Production schema provenance
- **Impact:** Git 中的权限收紧与 Production 实际策略是否完全一致缺少直接 Production 证据，存在授权边界无法证明的风险。
- **Pilot impact:** NON-BLOCKING；Minimum Security 尚未完成，不能将其写成 Security PASS。
- **Evidence:** `PROJECT_HANDOFF.md` 中的 BUG-003 与 RLS 风险记录；Git 中存在 `20260821120000_harden_matchmaking_permissions_and_group_lifecycle.sql`；`MIGRATION_PROVENANCE.md` 明确部分 Production migration history 为 `NOT_RECORDED`。当前没有足够证据证明 Production 的实际策略已完成逐项验证。
- **Root cause:** legacy policy surface 与 Production migration provenance 未形成可 replay、可逐项核对的证据链。
- **Fix / Decision:** 不 replay 历史 migration，不 repair history；由 02 定义只读/受控验证，任何新数据库变化必须 forward-only 并单独授权。
- **Verification:** NOT VERIFIED；等待 Minimum Security / Production QA evidence。
- **Production status:** PRODUCTION QA PENDING；未执行数据库修改。
- **Next action:** 仅在批准的 Minimum Security 范围内验证 User Isolation、Non-member 与 Former Member 授权结果。
- **Closed date:** UNKNOWN

### JIY-P1-003 — `REALTIME_RECONNECT_STALE_STATE_RESILIENCE`

- **Severity:** P1
- **Status:** INVESTIGATING
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Realtime subscription、reconnect、stale state、Active Session UI recovery
- **Impact:** Realtime 重连、断线重订阅和 stale state 处理的完整证据不足，可能使玩家看到过期成员/Session 状态。
- **Pilot impact:** NON-BLOCKING；正常 Realtime hydration、Chat 与 Active Room regression 已 PASS，但异常重连证据不足。
- **Evidence:** `PROJECT_HANDOFF.md` BUG-004 与 Realtime 风险记录；当前 Production regression 验证了正常 Realtime hydration 和 Chat，不等于完整 reconnect failure coverage；Final Gate 的 Minimum Observability 仍为 PENDING。
- **Root cause:** `NOT RECORDED`；当前登记的是已知 resilience evidence gap，不推断为已发生 Production failure。
- **Fix / Decision:** 不扩大本任务范围；按 Final Gate 和风险范围补充可追踪的 reconnect / stale-state evidence。
- **Verification:** NOT VERIFIED。
- **Production status:** 正常路径已验证；异常重连路径 PRODUCTION QA PENDING。
- **Next action:** 由 03 定义所需最小 reconnect evidence，02 负责技术风险判断。
- **Closed date:** UNKNOWN

### JIY-P1-004 — `PRESENCE_ABNORMAL_CLOSE_STALENESS`

- **Severity:** P1
- **Status:** PRODUCTION_QA_PENDING
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Presence heartbeat、abnormal close、reconnect grace、active presence residue
- **Impact:** 异常关闭或断线时 presence 是否在预期 TTL / reconnect grace 内收敛，缺少完整证据，可能影响成员在线状态判断。
- **Pilot impact:** NON-BLOCKING；当前正常 Active Room regression 与 active residue 检查通过，但异常关闭专项证据未完成。
- **Evidence:** `DECISIONS.md` DEC-009；`20260823100000_presence_reconnect_grace.sql` 与 `CURRENT_STATE.md` 中的 180 秒 reconnect grace 记录；`PROJECT_HANDOFF.md` BUG-005；staging timing evidence 尚未完整登记。
- **Root cause:** `NOT RECORDED`；当前登记为异常关闭场景的验证缺口。
- **Fix / Decision:** 保持 Presence 与生命周期分离、保持 180 秒 reconnect grace；不修改 Presence、TTL 或数据库。
- **Verification:** NOT VERIFIED。
- **Production status:** 正常路径已观察；异常关闭场景 PRODUCTION QA PENDING。
- **Next action:** 仅按批准范围完成异常关闭/重连时序验证。
- **Closed date:** UNKNOWN

### JIY-P1-005 — `OPS_AUTH_RATE_LIMITING_GAP`

- **Severity:** P1
- **Status:** CONFIRMED
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** OPS/internal auth、登录尝试限制、运维入口
- **Impact:** 运维认证入口的 rate limiting 证据不足，增加凭据猜测或异常请求的风险。
- **Pilot impact:** NON-BLOCKING；不属于本轮 Final Private Pilot Gate 的玩家核心流程，但属于已知运维安全风险。
- **Evidence:** `PROJECT_HANDOFF.md` BUG-006 的静态风险记录；本项目当前事实源没有记录已完成的 rate-limit 验证或修复。
- **Root cause:** `NOT RECORDED`。
- **Fix / Decision:** 不在本任务修复，不扩大为完整安全审计；由 02 提供最小化 rate-limit 修复策略，交 00/03 决策优先级。
- **Verification:** NOT VERIFIED；没有执行攻击或压力测试。
- **Production status:** UNKNOWN / NOT RECORDED。
- **Next action:** 作为非阻塞 P1 进入安全 follow-up；不得把未验证写成 PASS。
- **Closed date:** UNKNOWN

## P2 Issues

### JIY-P2-001 — `MIGRATION_DOCUMENTATION_CONSTRAINT_DRIFT`

- **Severity:** P2
- **Status:** CONFIRMED
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Migration documentation、schema/constraint drift、release provenance
- **Impact:** 文档、migration 文件、实际 schema/constraint 与执行 provenance 之间存在未完成对齐，增加后续判断和审计成本。
- **Pilot impact:** NON-BLOCKING；不修改当前 Production，不影响已验证的 Pilot 核心闭环。
- **Evidence:** `PROJECT_HANDOFF.md` BUG-007；`MIGRATION_PROVENANCE.md` 对 `NOT_RECORDED`、不可 replay artifact 与 forward-only 规则的明确记录。
- **Root cause:** 历史 migration 执行记录不完整，且 legacy 文档与当前事实源存在时间层级差异。
- **Fix / Decision:** 保持 migration provenance 规则有效；不 replay、不 repair history；未来变化只允许新 migration forward-only。
- **Verification:** 文档规则已登记；历史 schema/constraint 全量对齐 NOT VERIFIED。
- **Production status:** 未执行 Production 修改；provenance gap 仍存在。
- **Next action:** 仅在获得明确授权时补充事实记录或新 forward-only migration 设计。
- **Closed date:** UNKNOWN

## Historical Baseline

### JIY-HIST-001 — `HISTORICAL_GHOST_ROOMS_BASELINE`

- **Severity:** HIST / P1 baseline
- **Status:** DEFERRED
- **Owner:** 02｜技术负责人
- **Found date:** 2026-08-22
- **Affected area:** Historical Room data、New Ghost quality metric
- **Impact:** 5 个历史 ghost Room 仍存在；若不排除会污染当前 New Ghost 指标。
- **Pilot impact:** NON-BLOCKING；它们是 KNOWN HISTORICAL BASELINE，不是当前 Open P0。
- **Evidence:** `DECISIONS.md` DEC-007；`CURRENT_STATE.md` 明确记录 historical ghost baseline = `5`，New Ghost = `0`。
- **Root cause:** `NOT RECORDED`；属于历史数据状态。
- **Fix / Decision:** 不删除、不修改、不 backfill、不 repair；所有当前质量查询必须显式排除这 5 个历史 Room。
- **Verification:** 当前 New Ghost = `0`；New Active Residue = `0`；历史 baseline 仍保留。
- **Production status:** KNOWN HISTORICAL BASELINE，保持不变。
- **Next action:** 仅在后续查询中继续排除并单独报告；不得计入 New Ghost。
- **Closed date:** UNKNOWN

## FINAL PRIVATE PILOT GATE EVIDENCE

### JIY-GATE-001 — `FINAL_PRIVATE_PILOT_GATE_EVIDENCE`

- **Severity:** GATE
- **Status:** PENDING
- **Owner:** 03｜QA 与上线负责人
- **Found date:** 2026-08-23
- **Affected area:** Final Private Pilot Gate evidence completeness
- **Impact:** 剩余 Gate 证据未完成前，不能据此宣布完整 Final Private Pilot Gate PASS 或 GO。
- **Pilot impact:** Gate decision pending；这不是 P0 Issue。
- **Evidence:**
  - Active Room Refresh / Navigation: `PASS`。
  - Matching transition Refresh: `PENDING`。
  - Matching Back / Forward: `PENDING`。
  - Minimum Security: `PENDING`。
  - Minimum Observability: `PENDING`。
  - Desktop UI 1366×768 / 1440×900 / 1920×1080: `PENDING`。
  - New Ghost: `0`。
  - New Active Residue: `0`。
  - Current New P0: `0`。
- **Root cause:** NOT APPLICABLE；这是 Gate Evidence 缺口，不是已确认产品缺陷。
- **Fix / Decision:** 按 03 定义的剩余 Gate 范围补齐证据；不得因为 PENDING 将其登记为 P0。
- **Verification:** 部分 PASS，整体 Gate `PENDING`。
- **Production status:** PRODUCTION QA PENDING；本次建立台账未执行测试、部署或 Production 操作。
- **Next action:** 由 03 继续安排剩余 Gate evidence；ENG-00 不自行宣布 Gate PASS。
- **Closed date:** UNKNOWN

### JIY-GATE-002 — `PROGRESSIVE_STATEFUL_CAPACITY_VALIDATION`

- **Severity:** GATE
- **Status:** PENDING
- **Owner:** 03｜QA 与上线负责人
- **Found date:** 2026-08-24
- **Affected area:** Production Stateful capacity rehearsal；5→500 渐进式容量探顶
- **Impact:** 当前只有专用账号 provisioning、认证 smoke 与 runner dry-run 证据；5 人 stateful 阶段在完成前超时，尚未形成可复核的容量曲线或安全容量结论。
- **Pilot impact:** 当前不自动阻塞为 P0；40-person capacity confidence 仍 `NOT ASSESSED / BLOCKED PENDING EVIDENCE`。
- **Evidence:** `run_id=capstate500-stage5-0824`；runner 输出 `The operation was aborted due to timeout`；阶段 evidence 目录未生成结构化文件；超时后 health 为 `status=ready`、`matching=0`、`playing=0`；app/gateway restart `0`、OOM `false`。
- **Root cause:** UNKNOWN；失败请求 endpoint、底层 `error.cause`、请求 ledger 与完整 DB integrity 查询未捕获，不得推测为 Runner、Network 或 App。
- **Fix / Decision:** 本次不修改代码、不重跑同一失败阶段、不继续升级人数；由 02/03 先决定 runner 超时证据链与安全收敛方案，再授权新的容量运行。
- **Verification:** 5 人阶段 `INCONCLUSIVE / STOPPED BEFORE COMPLETION`；10 人及以上未执行；Login/read-only burst 与 500 账号 provisioning 不能替代 stateful capacity evidence。
- **Production status:** PRODUCTION QA PENDING；本次未执行 migration、部署、SQL 清理或手工 Production 数据修改。
- **Next action:** 保留现有日志与健康快照，补齐可归因的失败证据后再由 03 决定是否重新运行；不得把该 Gate 标为 PASS。
- **Closed date:** UNKNOWN

## FACT SOURCE CONFLICT

本次同步前曾存在以下冲突；当前正式事实源中的 P0 closure 措辞已完成同步：

1. `docs/project/CURRENT_STATE.md` 与 `docs/project/CHANGELOG.md` 原先保留的“P0 closure awaiting 03 / closure pending”旧措辞，已同步为三个 P0 均 `CLOSED`，Current New P0 = `0`；`JIY-P0-001`、`JIY-P0-002`、`JIY-P0-003` 的 closure 记录未改变。Git baseline 与 Production deployment label 仍是两个概念。
2. `PROJECT_HANDOFF.md` 是历史档案，仍包含旧 branch / HEAD 与旧阶段描述；当前 `CURRENT_STATE.md`、`DECISIONS.md`、`MIGRATION_PROVENANCE.md` 及当前 `main` 实际状态优先。旧 handoff 中与当前 Production 回归结果冲突的旧快照不自动重新登记为当前 P0。
3. `PROJECT_HANDOFF.md` 中部分旧 BUG 条目是静态风险或历史快照；只有能与当前证据对应的风险才登记为 P1/P2，未验证项明确标记 `INVESTIGATING` 或 `PRODUCTION_QA_PENDING`。

## Change and Closure Rules

- 新问题按 `JIY-P0-*`、`JIY-P1-*`、`JIY-P2-*`、`JIY-GATE-*`、`JIY-HIST-*` 递增编号，不复用已使用编号。
- Issue 关闭必须有实际验证证据和对应负责人判断；ENG-00 只提交证据，不自行宣布 Gate PASS。
- Production deployment label 与 Git commit/baseline 分开记录；没有字节级证据不得声称二者一致。
- 历史 5 个 ghost Room 只能作为 baseline 观察，禁止删除、修改、backfill 或计入 New Ghost。
- 本台账建立本身不代表代码、测试、数据库、migration 或 Production 有任何变化。
