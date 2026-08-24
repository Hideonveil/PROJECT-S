# Zero-Cost 40-Person Capacity Validation

状态：`IMPLEMENTATION IN PROGRESS / PRODUCTION EXECUTION NOT AUTHORIZED`

当前 release candidate：`875bb9786b5c4c5684de87358cb0289236adc869`。

本目录保存执行计划、环境对照和运行证据模板。实际 token、password、service role、数据库连接串和真实用户隐私信息不得进入 Git 或证据目录。

## 当前安全边界

- `tools/capacity/runner.mjs` 默认是 `--dry-run`，不发网络请求。
- Read-only burst 只允许固定 GET/HEAD 路径，且 `/api/health` 不得超过总请求数 10%。
- Production host 必须同时提供 `--allow-production` 和等于 `run_id` 的 `--production-ack`。
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

只生成计划：

```bash
pnpm capacity:run -- --dry-run --run-id cap100-YYYYMMDD-HHMMSS --max-users 100 --max-rps 10 --max-requests 600 --duration 60
```

Production read-only burst 只有在 00 批准具体窗口后才可执行：

```bash
pnpm capacity:run -- --execute-read-only \
  --base-url https://www.jiyuan.online \
  --run-id cap100-YYYYMMDD-HHMMSS \
  --manifest /secure/path/manifest.json \
  --max-users 25 --max-rps 10 --max-requests 600 --duration 60 \
  --allow-production --production-ack cap100-YYYYMMDD-HHMMSS
```

上面的命令只是受控 read-only burst 示例，不构成当前运行授权。
