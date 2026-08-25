# Synthetic Account Registry

> Registry status: `READY` as a no-secret registry artifact; identity/run mappings marked
> `NOT RECORDED` or `UNKNOWN` are evidence gaps, not credentials.
>
> Last updated: 2026-08-25 (Asia/Shanghai)

本 registry 只记录明确的 synthetic / capacity / internal test identity 的治理事实。
它不保存密码、password、access token、refresh token、service role、Authorization header
或任何可用于登录/调用的 secret。`anonymous_user_id` 只有在安全取得并确认后才可填入。

## Policy

- `account_type=synthetic_test`，`purpose=capacity`；测试账号必须与真实用户永久可区分。
- ENG-00 对账号数量、provisioning、session 安全取得和复用拥有自治权；不因数量向 00 请求人工账号或密码。
- provisioning 可使用受控 admin/service role，但 Matching、Room、Session、Chat、Goodbye、Leave、Feedback 等业务行为必须使用普通用户身份，并走正常 Auth / RLS / API / RPC 路径。
- 测试账号不参与真实用户 matching；不关闭邮箱/Auth/rate-limit 保护；测试实体只能通过正常生命周期或 reconciliation 收敛。
- 旧 active entity 不计入下一次 run 的 New Ghost / New Active Residue；其 ID 必须冻结并单独记录。

## Registry

| synthetic_id | anonymous_user_id | purpose | created_at | status | last_run_id |
|---|---|---|---|---|---|
| `CAP001` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `synthetic; active ticket residue; prior Auth smoke HTTP 401` | `UNKNOWN` |
| `CAP002` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `synthetic; active ticket residue; prior Auth smoke HTTP 401` | `UNKNOWN` |
| `CAP003` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `synthetic; active ticket residue; prior Auth smoke HTTP 401` | `UNKNOWN` |
| `CAP004` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `synthetic; active ticket residue; prior Auth smoke HTTP 401` | `UNKNOWN` |
| `CAP005` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `synthetic; active ticket residue; prior Auth smoke HTTP 401` | `UNKNOWN` |
| `CAPACITY-500-POOL` | `NOT RECORDED IN CURRENT REPOSITORY` | `capacity` | `NOT RECORDED` | `documented 500-account pool; raw provisioning manifest not present in canonical repo; identity mapping not proven` | `capstate500-0824` |

## Current evidence boundary

- Production health showed `matching=3` and `playing=2`; the five displayed profiles were
  `CAP001`–`CAP005`. This establishes synthetic naming, not that all associated ticket/pair/
  group/room/session rows have completed a normal lifecycle.
- `REAL PRODUCTION USERS=0`. Therefore current real-user collision risk is `NONE` under the
  present closed-pilot assumption, while lifecycle residue remains a product/reconciliation
  issue and must not be deleted to make a test green.
- Historical ghost IDs/baselines remain frozen. The next run records only `New Ghost` and
  `New Active Residue`.
- No account is considered ready for a stateful rerun until its ordinary-user Auth session is
  securely obtained and the preflight inventory is complete.
