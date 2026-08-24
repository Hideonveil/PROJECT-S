# Migration Provenance

本文件记录已确认直接执行于当前 Production 的 migration artifact，以及仍需 provenance review 的 migration artifact。

## Rules

- `production_history_status = NOT_RECORDED` 不得解释为“未执行”。
- 本文件记录的 migration 仅作为 provenance artifact 保存。
- 不允许直接 replay 这两个 migration。
- 不允许根据这两个文件执行 migration repair 或修改 production `schema_migrations`。
- 后续数据库修复必须使用新的、明确审查过的 forward-only migration。
- 本记录不授权任何新的生产数据库写操作。
- Presence in Git does not imply confirmed production execution.
- Presence in Git does not imply safe replay.
- Production history for these migrations is NOT_RECORDED.
- Future database changes must use forward-only migrations.

## Executed artifacts

| Migration | Production execution status | Production history status | Current SHA-256 | Production fact |
|---|---|---|---|---|
| `20260825110000_optimize_rls_initplan.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `ed0354365a1c4f806bbb8eb8e7d4958a495ba149410718d14c57a32707d1bf9e` | 已按明确授权在 Production 执行。仅将 `profiles_insert_own`、`profiles_update_own`、`profiles_select_own`、`sessions_select_participant` 中的 `auth.uid()` 改为 statement-stable initplan；roles、commands、USING/WITH CHECK、participant visibility 未变。Performance Advisor 重跑为 0 errors / 0 warnings；不得 replay，不得 repair history。 |
| `20260825130000_return_reservation_conflicts.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `f1b2b8359faadc12f3a559456cbfb3f230d3d17cfb352d0d385594aade281296` | 已按明确授权在 Production Supabase SQL Editor 执行一次。Pair/Group reservation 的预期业务冲突改为结构化 JSON 返回，真实 serialization failure 保持异常语义；routine 执行权限仅 `postgres` / `service_role`。未 replay/repair migration history，未修改历史业务数据；不得直接重复执行。 |
| `20260824100000_session_member_likes.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `be1d769a470f98062063a7ac7c38b39b57a185516e6621e65415344cd8fa95af` | 已按明确授权在 Production 直接执行的 additive forward-only migration。`session_member_likes`、约束、3 个索引、RLS enabled 与 3 个 policy 已只读确认；表内行数为 0；未修改历史点赞、旧 tags、历史 ghost 或 `schema_migrations`。不得 replay，不得 repair history。 |
| `20260822210000_sync_room_with_terminal_session.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `747ddcdbd7a08a4d751acecf1c2b38f5be915914913f3355e33b2509c6c0b141` | 已按既定部署流程直接执行于 Production，用于统一 terminal Session 与 Room 终态；未清理历史 ghost Room，未做历史数据 backfill。 |
| `20260823100000_presence_reconnect_grace.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `2c0143f49e048816ea91543c131c3c90322e63d7efcf0a448edb0c42951c01a9` | 已按既定部署流程直接执行于 Production，包含 Presence heartbeat、effective-online TTL、Room reconnect grace 及 stale reconciliation；未 replay 缺失 migration history。 |

## Production schema reconciliation artifacts

| Migration | Migration execution status | Production history status | Current SHA-256 | Production fact |
|---|---|---|---|---|
| `20260825090000_reconcile_production_matchmaking_indexes.sql` | `NOT_EXECUTED_AS_MIGRATION` | `NOT_RECORDED` | `d3db474d8e9ebace0d617a39babad35d5fa6fc023a72807b2aa20c5c921026d5` | Production 已直接存在并经 catalog 只读确认：`matchmaking_pairs_active_unordered_unique` 与 12 个 matchmaking FK indexes。该文件仅以 forward-only、idempotent DDL 表达当前 Production schema；本次未执行 migration、未修改 `schema_migrations`。不得在当前 Production 自动 replay 或用于 repair history。 |

## Provenance-review artifacts

以下 10 个 migration 进入 Git 只代表保存未闭合 provenance 的 SQL artifact。它们的 production history 均为 `NOT_RECORDED`，不能据此推断已经在 Production 执行，也不能据此认为可以安全 replay。

| Filename | SHA-256 | Production execution status | Production history status | Known schema/function evidence | Data effect | Replay risk |
|---|---|---|---|---|---|---|
| `0016_casual_group_matchmaking.sql` | `913658980d5cf73dc7c39beffe8dd67329d52ed3d25fcdaffc332e9495aa8032` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production 观察到 `matchmaking_groups`、`matchmaking_group_members` 及相关 group runtime functions；完整 schema/policy/publication parity 未证明。 | migration-time data effect 未验证。 | 高：依赖基础 matchmaking schema，包含 group schema、RLS 与多项 RPC；禁止直接 replay。 |
| `20260820100000_deadlock_ranked_duo_only.sql` | `51fecdf98090094693ab1035d0b9dce08b5c8a52f5320f76e99c537620e8526a` | `EXECUTION_UNVERIFIED` | `NOT_RECORDED` | 未有足够证据证明该文件对应的最终 ruleset JSON。 | `matchmaking_rule_sets` update 的数据效果未验证。 | 高：会改变 Deadlock ranked duo 规则；禁止直接 replay。 |
| `20260821120000_harden_matchmaking_permissions_and_group_lifecycle.sql` | `b35d1b519f3ae33611f5eaaeb2fa6d8c19f0a6055ffec9b28669a6e9e452fb84` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production 观察到 group-session trigger、internal function signatures 及部分权限效果。 | migration-time data effect 未验证。 | 高：涉及 RLS、grant/revoke、trigger replacement；依赖 group schema；禁止直接 replay。 |
| `20260821150000_username_email_auth.sql` | `0fe9b93d174edfaf20d45b7ee4b86dacb944b84282e89eb57f25be3d7016949e` | `EXECUTION_UNVERIFIED` | `NOT_RECORDED` | Production username column/index 未被独立 catalog 证据确认。 | 无显式 data backfill；production schema/data effect 未验证。 | 中：unique index 可能受现有数据影响；禁止直接 replay。 |
| `20260821170000_reconcile_ghost_matchmaking.sql` | `dc8c097f41a3cc47a90be1f52473849a3b277b52bc4260a1b433d0e59c29935e` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production 观察到 pair/group terminal-ticket reconciliation functions/triggers。 | migration-time reconciliation/data repair effect 未验证。 | 高：会影响 ticket/group/pair lifecycle 收敛；禁止直接 replay。 |
| `20260821190000_close_group_tickets_on_session_end.sql` | `f6798cfe667436c9b8802af1c93abbd118e05f094ad20363764d1396ba477d58` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production Session lifecycle function/trigger body 已观察到对应 group/ticket 收敛逻辑。 | 顶层 group/ticket update 的历史数据效果未验证。 | 高：会更新 group/ticket 状态并替换 lifecycle function；禁止直接 replay。 |
| `20260821200000_deadlock_rank_distance.sql` | `d6a650d0d37ec4bf1a584f9bbef443477f9e7cf58b989583252ef05c2d9d9ffa` | `EXECUTION_UNVERIFIED` | `NOT_RECORDED` | 未有足够证据证明生产 ruleset 的最终 `maxRankDistance` 值来自该文件。 | `matchmaking_rule_sets` update 的数据效果未验证。 | 高：会改变 ranked matchmaking 行为；禁止直接 replay。 |
| `20260822090000_casual_team_range_intersection.sql` | `877d1767790c9cb40afb6be3e5ec087d6040ebe612cf315d3baec05611ce193a` | `EXECUTION_UNVERIFIED` | `NOT_RECORDED` | Production group functions 部分存在，但完整最终 function/data effect 未证明。 | legacy group normalization、ticket/group transitions 的数据效果未验证。 | 很高：含数据状态转换与 RPC replacement；禁止直接 replay。 |
| `20260822170000_explicit_exit_lifecycle.sql` | `e35f9f1bb7e93c7e20904eeb14ef1c536fdb1410bc1f279cb5b2fe4b72951123` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production 观察到 explicit lifecycle triggers 与相关 no-op/maintenance functions。 | infinity deadline 等顶层 ticket/pair/group update 的数据效果未验证。 | 很高：改变退出与过期语义，且可能影响现有 active matching；禁止直接 replay。 |
| `20260822183000_casual_group_start_with_two.sql` | `8af0fae39581c0f18d52f1ff26eb5a0f95472e3b69a5aaa183b14dd25d665232` | `SCHEMA_EFFECT_CONFIRMED` | `NOT_RECORDED` | Production `matchmaking_start_group` body 与 two-player-start logic 一致。 | 无显式 data backfill；精确执行事实仍未验证。 | 中高：function replacement 有严格顺序依赖；禁止直接 replay。 |

## Historical migration remediation

- `0009_realtime_matchmaking.sql` 曾在 dirty worktree 中被修改，改动为将 `rankedPartyMax` 从 `6` 改为 `2`，并增加 `rankedTeammateMax = 1`。
- 这两项修改表达的是当前产品的 Deadlock Ranked Duo 规则：最多两名玩家，即一名 owner 加一名 teammate。
- 后续 forward-only migration `20260820100000_deadlock_ranked_duo_only.sql` 已明确设置：`rankedPartyMax = 2` 与 `rankedTeammateMax = 1`。
- 因此 `0009_realtime_matchmaking.sql` 已恢复为 Git 中的原始版本，历史 migration 不再承载新的现行规则。
- 不得再次修改已提交的历史 migration 来表达产品规则；以后必须使用新的 forward-only migration。

### Interpretation

- `SCHEMA_EFFECT_CONFIRMED` 不得写成 `CONFIRMED_EXECUTED`。
- `EXECUTION_UNVERIFIED` 表示现有证据不足，不能猜测执行与否。
- Production history for these migrations is `NOT_RECORDED`。
- Presence in Git does not imply confirmed production execution。
- Presence in Git does not imply safe replay。

## Evidence and limits

- 两个文件的当前磁盘 SHA-256 与既有生产部署记录一致。
- 生产 `supabase_migrations.schema_migrations` 的既有 8 条 history 记录中没有这两个文件的对应版本，因此两者均标记为 `NOT_RECORDED`。
- 生产执行事实来自此前的只读核验、部署输出及后续生产验证记录；本文件不把对象等价误写成 migration history 已登记。
- 文件进入 Git 只代表保存 provenance，不代表可再次执行。

## Future changes

任何对 Room/Session lifecycle、Presence、Online/Offline 或相关数据库对象的后续修复，必须新增 forward-only migration，经过独立 review、非生产验证和明确生产授权后执行。
