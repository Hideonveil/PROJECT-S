# 机缘 Backlog

> 本文件收纳非当前 P0 的工作，防止后续 Agent 把它们重新升级为当前任务。当前唯一任务仍是 Final Private Pilot Gate；除非用户明确授权，不从本列表扩展范围。

## 当前没有新的已确认 P0

历史 Room / Session lifecycle P0 已修复并部署；当前新 ghost 为 0，已有生产核心链路 PASS。本节不创建“推测性 P0”。

## P1 — 需要后续排期，但不属于当前 Private Pilot 文档整理任务

- **Release version metadata**：修复 `/api/health` 返回 `version=unknown`，让健康检查能明确显示实际部署 commit / version；不改变业务状态机。
- **Clean release provenance**：把当前 dirty 工作树拆分为可审计的干净 commit / tag，并建立生产部署到 commit 的可追踪记录。
- **Presence 专项 staging 时序验证**：在真正独立、空、启用 `pg_cron` 的 staging 中补做 Presence TTL、matching offline、Room `<180s` reconnect、`>=180s` timeout、refresh regression 五项验证。不得用生产替代 staging，也不得绕过 `PRESENCE_CRON_REQUIRED`。
- **Migration reconciliation manifest follow-up**：继续区分 history missing、schema equivalent、schema missing、object drift、data effect unverified；不 replay 旧 migration，不直接 repair 生产 history。
- **Observability follow-up**：在不引入大型 logging 平台的前提下，确保 `user_id / room_id / session_id / ticket_id / request_id / action / route / timestamp / error` 在适用时可关联一局。
- **Security evidence follow-up**：补齐 foreign-ID mutation、authenticated non-member Room、聊天 XSS 的最小攻击证据；发现真实绕过才升级为 P0。

## P2 — 不阻塞 Private Pilot 的体验问题

- 底部 ticker 在部分视口存在轻微遮挡。
- 1440×900、1920×1080 等 Desktop UI 证据若工具受限，保留为 evidence gap；不做完整 Responsive Audit。
- 继续清理旧兼容 UI / API 前，先确认新旧 Room / Session 调用关系；不能为“代码看起来更干净”删除旧入口。
- 进一步统一多人文案、卡片和信息布局，只在不影响已验证核心流程时处理。

## Public Beta backlog

- 更广泛的浏览器、设备和网络环境矩阵。
- 面向更大用户量的 rate limiting、容量、性能和故障演练。
- 更完整的权限、隐私、XSS、CSRF、token 生命周期和安全审查。
- Accessibility、SEO、完整响应式、视觉回归和性能优化。
- 更系统的运营告警、日志留存和用户问题定位流程。
- 真实用户反馈、留存、匹配成功率和会话完成率数据。

## Future / 明确不属于当前 MVP

- Community。
- Friends 正式产品化和邀请体系。
- 第二款游戏及更多游戏规则。共享 `GameDefinition` 注册表、Deadlock adapter 与 fake-game
  跨游戏合同已经具备；真实接入仍需新增该游戏自己的定义、素材、配置呈现、规则测试和容量场景。
  禁止复制共享生命周期，也禁止新增散落的 `game === "deadlock"` / 游戏名分支。
- 商业化、付费、广告或增长系统。
- 语音、移动端专属体验和无关设计系统重构。

## 历史基线（不作为待办）

- 5 个历史 ghost Room：保留 baseline，不清理；后续只判断部署后是否新增 ghost。
- 生产 migration history：不因记录缺失直接补跑；只有在完成差异清单并得到明确授权后，才设计新的 forward-only 修补。
