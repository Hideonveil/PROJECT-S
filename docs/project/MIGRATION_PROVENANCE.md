# Migration Provenance

本文件记录已确认直接执行于当前 Production 的 migration artifact。

## Rules

- `production_history_status = NOT_RECORDED` 不得解释为“未执行”。
- 本文件记录的 migration 仅作为已执行生产 artifact 保存。
- 不允许直接 replay 这两个 migration。
- 不允许根据这两个文件执行 migration repair 或修改 production `schema_migrations`。
- 后续数据库修复必须使用新的、明确审查过的 forward-only migration。
- 本记录不授权任何新的生产数据库写操作。

## Executed artifacts

| Migration | Production execution status | Production history status | Current SHA-256 | Production fact |
|---|---|---|---|---|
| `20260822210000_sync_room_with_terminal_session.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `747ddcdbd7a08a4d751acecf1c2b38f5be915914913f3355e33b2509c6c0b141` | 已按既定部署流程直接执行于 Production，用于统一 terminal Session 与 Room 终态；未清理历史 ghost Room，未做历史数据 backfill。 |
| `20260823100000_presence_reconnect_grace.sql` | `CONFIRMED_EXECUTED` | `NOT_RECORDED` | `2c0143f49e048816ea91543c131c3c90322e63d7efcf0a448edb0c42951c01a9` | 已按既定部署流程直接执行于 Production，包含 Presence heartbeat、effective-online TTL、Room reconnect grace 及 stale reconciliation；未 replay 缺失 migration history。 |

## Evidence and limits

- 两个文件的当前磁盘 SHA-256 与既有生产部署记录一致。
- 生产 `supabase_migrations.schema_migrations` 的既有 8 条 history 记录中没有这两个文件的对应版本，因此两者均标记为 `NOT_RECORDED`。
- 生产执行事实来自此前的只读核验、部署输出及后续生产验证记录；本文件不把对象等价误写成 migration history 已登记。
- 文件进入 Git 只代表保存 provenance，不代表可再次执行。

## Future changes

任何对 Room/Session lifecycle、Presence、Online/Offline 或相关数据库对象的后续修复，必须新增 forward-only migration，经过独立 review、非生产验证和明确生产授权后执行。
