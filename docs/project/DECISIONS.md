# 机缘已确认决策

> 规则：每条决策有稳定 ID。除非有新的明确产品决定，不应在后续会话中重新争论或用旧代码行为覆盖它。

## DEC-001 — Refresh 不等于 Leave

- 状态：ACTIVE
- 决策：Refresh、页面导航、Back / Forward、短暂断线和浏览器生命周期事件不等同于用户主动离开。
- 原因：此前 `pagehide` / 离线处理可能把正常刷新误判为退出，导致多人 Session 无法恢复并将成员带回首页。
- 约束：刷新恢复必须从服务端真实 Room / Session / members[] 状态构建，不能依赖浏览器内存中的 partner。

## DEC-002 — 只有 Explicit Leave 才进入退出生命周期

- 状态：ACTIVE
- 决策：只有用户明确点击 Leave 才调用主动退出路径。Presence offline 本身不触发 Goodbye，也不立即把 active Room 取消。
- 原因：短暂断线、刷新、关闭页面后快速重连都应有恢复机会。
- 约束：matching offline 可以按 Presence 规则取消未成房 ticket；已经进入 Room / Session 的成员走独立 reconnect grace。

## DEC-003 — Terminal Session 必须同步 Room 终态

- 状态：DEPLOYED
- 决策：`Session.cancelled → Room.cancelled`，`Session.completed → Room.completed`；不允许 terminal Session 与 `Room.status = playing` 并存。
- 原因：修复 5 个历史 ghost Room 所暴露的状态不同步问题，并将同步收敛到 Session lifecycle。
- 约束：不在本决策范围内清理历史 5 个 ghost Room；重复终止与并发终止必须幂等。

## DEC-004 — Casual Group 使用 members[]

- 状态：DEPLOYED
- 决策：Casual 多人 Group / Room / Session 的事实模型是 `members[]`。`currentUser` 是当前用户，其他玩家是 `otherMembers[]`；`partner` 仅可作为兼容字段。
- 原因：产品已支持三人及多人，固定 `me + partner` 会丢成员、错误恢复和错误渲染。
- 约束：成员展示、刷新恢复、Goodbye、Feedback 和 Recent Connections 都必须以动态成员集合为事实源。

## DEC-005 — Goodbye denominator 使用 active member count

- 状态：DEPLOYED
- 决策：Goodbye 计数来自服务端真实状态，denominator 是当前 Room / Session 需要确认的 active member count。三人必须经历 `0/3 → 1/3 → 2/3 → 3/3`。
- 原因：固定 `2/2` 会使前端完成状态与后端等待状态冲突。
- 约束：请求必须幂等；Realtime 延迟时由服务端状态重新收敛。Goodbye UI 点击后直接提交，不出现旧二次确认弹窗。

## DEC-006 — Deadlock Ranked 保持 duo-only

- 状态：ACTIVE
- 决策：Ranked / 冲分继续使用合法双人规则；多人化只作用于 Casual Group / N-member Session 语义。
- 原因：Ranked 的两人匹配是明确产品规则，不是需要被机械多人化替换的遗留假设。

## DEC-007 — 历史 5 个 ghost Room 暂不清理

- 状态：ACTIVE
- 决策：历史 5 个 ghost Room 作为 baseline 保留，不删除、不清空、不回写状态。
- 原因：生产审计和部署验证需要比较“历史集合是否变化”与“部署后是否产生新 ghost”两个概念。

## DEC-008 — Production migration history 不盲目 replay

- 状态：ACTIVE
- 决策：生产 `schema_migrations` 缺失记录不能直接触发旧 migration replay，也不能直接 repair history。先比较生产实际 schema / object / data effect 与仓库最终状态，再用新的 forward-only migration 修补真实差异。
- 原因：旧 migration 可能包含不可逆数据变更、已存在对象或 Supabase managed object；盲目回放会造成破坏或权限错误。

## DEC-009 — Presence 与 Room / Session 生命周期解耦

- 状态：DEPLOYED
- 决策：Presence 使用 10 秒 heartbeat、30 秒 effective-online TTL。Room 成员离线后保留 180 秒 reconnect grace，时间从最后一次在线/断连锚点计算；超过 grace 才由系统 timeout leave 收敛。
- 原因：在线状态和业务退出是两个不同的状态机；必须避免 `pagehide → offline → false exit`。
- 约束：stale reconcile 由数据库 `pg_cron` 驱动，不依赖 OPS 请求或存活用户 heartbeat；timeout 不伪造 Goodbye。

## DEC-010 — MVP 范围保持收敛

- 状态：ACTIVE
- 决策：当前只维护已验证的 Deadlock MVP 核心链路，不扩展 Community、Friends 正式功能、第二款游戏、商业化或无关 UI / 技术审计。
- 原因：当前目标是 5–10 人 Private Pilot，不是继续扩大产品面。

## DEC-011 — 生产恢复能力必须有实际证据

- 状态：ACTIVE
- 决策：生产部署前的 Backup Gate 以实际逻辑备份和独立 staging restore 验证为准；仅有“文件生成成功”不算备份可恢复。
- 原因：Supabase Free Plan 没有 PITR / scheduled backup，必须保留可恢复的 roles、schema、data、history、函数/trigger 和 ghost baseline 证据。

## DEC-012 — 容量验证采用渐进式容量探顶

- 状态：ACTIVE
- 决策：容量验证使用 `5 → 10 → 20 → 30 → 40 → 50 → 75 → 100 → 125 → 150 → 200 → 300 → 400 → 500` 递增梯度，人数档位只是观测级别，不是预设的自动 FAIL 上限。当前容量工具支持到 `500`；超过 `500` 必须由 00 单独授权。
- 原因：需要识别 Production 在真实登录、匹配、Room / Session、Presence、Realtime 和 Chat 行为下的第一个可复现容量拐点，不能让 runner 的旧 20 人保护上限代替系统容量结论。
- 约束：不关闭 rate limit、不修改产品规则或 schema、不使用 service role 执行业务、不用 raw SQL 制造或清理业务状态；只有持续错误、资源危险、数据一致性破坏、Realtime 系统性失败或影响真实用户时才停止。当前没有形成 `LOGIN VALIDATED CAPACITY`、`MATCHING VALIDATED CAPACITY` 或 `STATEFUL VALIDATED CAPACITY` 结论。测试账号数量超过现有 500 个时，按 DEC-013 继续 provisioning，不把账号数量上限误作系统容量上限。

## DEC-013 — 测试账号优先复用 500 个专用身份

- 状态：ACTIVE
- 决策：所有后续容量验证、定向回归和演练优先从现有 500 个专用普通测试账号中分配身份；只有实际测试规模超过现有 500 个账号且确有需要时，ENG-00 才可继续创建新的专用普通测试账号。
- 原因：避免重复创建账号、减少账号治理分散，并保持测试身份与业务数据的可追溯性。
- 约束：新增账号必须使用明确的内部测试命名和独立 `user_id`，权限与普通玩家一致，不得授予管理员权限；service role 仅可用于受控 Auth/profile provisioning，不得作为普通 Actor 执行 Matching、Room、Chat、Goodbye、Leave、Feedback 或其他业务动作。账号 provisioning 不等于容量测试授权；每次 Production 测试仍须遵循既定 run_id、preflight、停止条件和逐级授权规则。凭据、access token 和 service role 不得进入 Git、manifest、日志或证据。
