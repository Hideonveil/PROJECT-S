# 机缘当前状态

> 状态快照日期：2026-08-23（Asia/Shanghai）
> 
> 本文件记录当前事实，不是下一轮开发计划。若与旧交接文档冲突，以本文件中的已验证生产证据和当前源码为准。

## 1. 当前阶段

- 当前阶段：Final Private Pilot Gate 准备阶段。
- 下一阶段目标：5–10 名真实玩家的 Private Pilot。
- 当前唯一任务：完成已经定义的 Final Private Pilot Gate；完成后停止上线前扩展测试，进入小规模真实玩家验证。
- 本轮建立事实源后不继续开发、测试、部署或扩大审计范围。

## 2. Git 与源码基线

- 仓库：`output/jiyuan-computer-handoff-2026-08-22/project-s-source`
- Canonical engineering branch：`main`。
- Branch Consolidation 输入的 Git 当前可信源码基线：`0828aa6ef0b575b1b92bbdc7dbfc415deb7c27ac`（`docs: sync current state with clean git baseline`）。`main` 已将 `agent/ui-shell-production` fast-forward 收敛到该基线；本次后续 docs-only commit 不改变 runtime source baseline。
- Project source working tree：clean。
- `agent/ui-shell-production` 已完成 fast-forward 收敛并保留，不删除该 branch。
- Runtime source baseline、tests/tooling、project docs 与 migration provenance 均已进入 Git。
- `0009_realtime_matchmaking.sql` 已恢复为历史原始版本；当前 migration provenance 规则保持有效：`NOT_RECORDED` 不得解释为未执行，不得 replay 或 repair production migration history，后续数据库变化必须使用 forward-only migration。
- `v0.1` / `v1` / `v2` 仅作为 historical archive，不承担当前项目事实源职责。
- 当前源码 migration 文件数：29。此前审计中使用的“27 个 migration”属于更早时间点，不能继续作为当前仓库总数。

## 3. Production 当前事实

- 公网入口：`https://www.jiyuan.online`
- 部署方式：腾讯云中国香港节点上的 Docker Compose，Caddy 对外提供 HTTPS 和代理。
- 最近已知 Production deployment label：`7bee0a2-dirty-presence-2c0143f4`。
- Git 当前可信源码基线与最近已知 Production deployment label 分开记录；目前没有证据证明 Production 容器与 `0828aa6ef0b575b1b92bbdc7dbfc415deb7c27ac` 字节级一致，不得将二者混为同一概念。
- 最近生产 `/api/health` 已确认：`ok=true`、`status=ready`、`online=0`、`matching=0`、`playing=0`、`users=29`。
- 该次健康检查时间：`2026-08-23T09:49:43.579Z`。
- 健康接口 `version` 字段返回 `unknown`；因此当前不能把 `version` 字段当作可靠 release identifier。实际部署标签如上，版本元数据缺口列入 backlog，不在当前事实源任务中修复。
- 生产前端静态 bundle 已确认包含 Presence heartbeat 客户端标记，说明 Presence 客户端代码已随网站发布。
- 生产数据库 project ref：`chqxaqibegpdjtedrxwx`。
- 生产数据库最近已确认：`pg_cron` 可用；Presence migration 所需字段、函数、trigger、cron job 已存在；执行前 active / playing / connecting / ready Session 均为 0。

## 4. 已确认的 Production / staging 证据

以下事项有本轮项目历史中明确的生产验收结果，作为 PASS 继承，不因旧交接文档的早期静态描述重新降级：

- Production backup + staging restore：PASS。逻辑备份、custom-format archive、SHA-256、schema / data / roles / migration history / function-trigger / ghost baseline 恢复核对均已有记录。
- Room / Session lifecycle P0 修复：已部署。
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

- Final Private Pilot Gate 的最小 Observability、Security 补证据和 Desktop UI Sanity 证据属于当前阶段事项；不得把它们自动写成已经完成。

### 非阻断但必须保留的事实

- Production health `version=unknown`，无法仅依赖健康接口判断部署版本。
- Project source working tree 当前 clean；但最近已知 Production deployment label 仍包含 `dirty`，且没有证据证明 Production 容器与当前 Git 基线字节级一致，因此 Production release provenance 仍需与 Git 基线分开理解。
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
