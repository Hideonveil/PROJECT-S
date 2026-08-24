# Zero-Cost 40-Person Capacity Validation

状态：`IMPLEMENTATION IN PROGRESS / PRODUCTION EXECUTION NOT AUTHORIZED`

当前 release candidate：`875bb9786b5c4c5684de87358cb0289236adc869`。

本目录保存执行计划、环境对照和运行证据模板。实际 token、password、service role、数据库连接串和真实用户隐私信息不得进入 Git 或证据目录。

## 当前安全边界

- `tools/capacity/runner.mjs` 默认是 `--dry-run`，不发网络请求。
- Read-only burst 只允许固定 GET/HEAD 路径，且 `/api/health` 不得超过总请求数 10%。
- Production host 必须同时提供 `--allow-production` 和等于 `run_id` 的 `--production-ack`。
- Auth preparation 只接受隐藏 TTY stdin 或权限严格为 `0600` 的临时 JSON secret file；Runner 使用 `/api/auth/login` 加 Supabase password sign-in 获取普通用户 token。密码和 token 只存在进程内，不进入 manifest、evidence、日志或 Git；secret file 读取后由 Runner 删除。
- Stateful 模式还需要 `--stateful-approval=<run_id>`；当前 lifecycle / Realtime adapter 尚未实现，因此会在发请求前停止。
- 不执行 Production load，不创建新的云资源或 Supabase Project。

## 证据文件

正式运行时，每个独立 `run_id` 应保存：

```text
environment-comparison.md
run-manifest.json
actor-events.ndjson
api-metrics.json
realtime-ledger.json
message-ledger.json
lifecycle-ledger.json
resource-metrics.json
integrity-before.txt
integrity-after.txt
container-logs.txt
caddy-errors.txt
db-rpc-errors.txt
cleanup-result.txt
summary.md
```

Runner 当前自动生成 `run-manifest.json`、`plan.json`、`actor-events.ndjson`、`api-metrics.json` 和 `resource-metrics.json`；其余文件必须在对应能力实现和批准运行后补齐，缺失时不得写 PASS。

## 推荐命令

先准备 A/B/C authenticated read 身份（只做 `/api/state` 与 `/api/session` GET smoke，不执行 burst）：

```bash
pnpm capacity:run -- --prepare-auth \
  --base-url https://www.jiyuan.online \
  --run-id cap-auth-YYYYMMDD-HHMMSS \
  --auth-secret-file /private/tmp/jiyuan-capacity-auth.json \
  --manifest-out /private/tmp/jiyuan-capacity-manifest.json \
  --allow-production \
  --production-ack cap-auth-YYYYMMDD-HHMMSS
```

secret file 只允许以下非 Git 临时内容，且必须 `chmod 600`：

```json
{"identities":[{"identity":"A","identifier":"...","password":"..."},{"identity":"B","identifier":"...","password":"..."},{"identity":"C","identifier":"...","password":"..."}]}
```

也可使用 `--auth-stdin` 交互输入；密码不回显。不要把该 JSON 或任何 token 放入仓库、manifest、summary、命令行或聊天。

只生成计划：

```bash
pnpm capacity:run -- --dry-run --run-id cap100-YYYYMMDD-HHMMSS --max-users 100 --max-rps 10 --max-requests 600 --duration 60
```

Production read-only burst 只有在 00/03 批准具体窗口后才可执行，并重新通过同一安全认证输入：

```bash
pnpm capacity:run -- --execute-read-only \
  --base-url https://www.jiyuan.online \
  --run-id cap100-YYYYMMDD-HHMMSS \
  --manifest /secure/path/manifest.json \
  --auth-secret-file /private/tmp/jiyuan-capacity-auth.json \
  --max-users 25 --max-rps 10 --max-requests 600 --duration 60 \
  --allow-production --production-ack cap100-YYYYMMDD-HHMMSS
```

上面的命令只是受控 read-only burst 示例，不构成当前运行授权。
