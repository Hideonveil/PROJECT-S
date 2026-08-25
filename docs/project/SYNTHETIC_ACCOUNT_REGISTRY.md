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
| `CAPSTATE500-R01` | `2b4c582d-0679-48e7-a15d-756b61b8d6cc` | `capacity` | `2026-08-24` | `synthetic_test; reused from capstate500-0824; ordinary Auth session verified; no preflight active state; 5-user run produced 1 active room_member residue in completed room` | `capstate500-reuse-20260825` |
| `CAPSTATE500-R02` | `c8dbbb47-0e1b-4027-a06c-ac12fb14f2c3` | `capacity` | `2026-08-24` | `synthetic_test; reused from capstate500-0824; ordinary Auth session verified; no preflight active state; 5-user run produced 1 active room_member residue in completed room` | `capstate500-reuse-20260825` |
| `CAPSTATE500-C01` | `9d9b9eaf-2bbf-437b-ae58-c9ded1a6d3ec` | `capacity` | `2026-08-24` | `synthetic_test; reused from capstate500-0824; ordinary Auth session verified; no preflight active state; 5-user run produced 1 active room_member residue in completed room` | `capstate500-reuse-20260825` |
| `CAPSTATE500-C02` | `cf015f77-388c-42a8-976c-46ef5d813b11` | `capacity` | `2026-08-24` | `synthetic_test; reused from capstate500-0824; ordinary Auth session verified; no preflight active state; 5-user run produced 1 active room_member residue in completed room` | `capstate500-reuse-20260825` |
| `CAPSTATE500-C03` | `58678e49-a6b4-42df-8a49-b9baac61114e` | `capacity` | `2026-08-24` | `synthetic_test; reused from capstate500-0824; ordinary Auth session verified; no preflight active state; 5-user run produced 1 active room_member residue in completed room` | `capstate500-reuse-20260825` |
| `CAPACITY-500-POOL` | `480 exact capacity_run_id rows + 20 legacy cap_stateful_824d rows; no credentials recorded` | `capacity` | `2026-08-24` | `identified by Auth metadata, naming convention, confirmed email, and creation window; five members safely reused` | `capstate500-reuse-20260825` |
| `CAP-REUSE-0825-R01A` | `a631516e-d339-430b-b044-cb4b53248279` | `capacity` | `2026-08-25` | `synthetic_test; fallback registration probe; email unverified; not used in business behavior` | `none` |

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

## capstate500-reuse-20260825

- Five identities were selected from the identified `capstate500-0824` pool and authenticated
  through both the normal app login and direct Supabase ordinary-user sign-in path. All five
  user IDs were distinct and had no preflight ticket, room, or session state.
- The 5-user stateful runner completed `2 Ranked + 3 Casual`, with Realtime, chat delivery,
  refresh, reconnect, goodbye, feedback, and final API state checks recorded in
  `output/capacity-validation/capstate500-reuse-20260825/`.
- The two rooms and two sessions reached `completed`, but five newly created `room_members`
  rows remained `status=active` under those completed rooms at post-run read-only inspection.
  This is `NEW ACTIVE RESIDUE=5`, frozen for lifecycle investigation; no raw SQL cleanup was
  performed.
- The fallback registration probe above was never authenticated for business behavior and
  remains a synthetic account only; no password or token is recorded here.
