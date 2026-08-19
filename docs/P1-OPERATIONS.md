# 机缘 P1 运营与监控

## 1. 每日漏斗

生产环境应用 `0013_p1_operations.sql` 后，服务端可以查询最近 14 天原始计数：

```sh
curl -H "Authorization: Bearer $OPS_TOKEN" \
  "https://jiyuan.online/api/ops/metrics?days=14"
```

返回注册账号、完成身份、开始搜索、候选展示、确认成功、完成 Session、评价、
好友、反馈和前后端错误数量。这里只有原始计数，不把转化率公式或匹配权重写死。

## 2. 错误记录

- 服务端 5xx 写入 `product_events.event_name = server_error`，并同时输出结构化 Docker 日志。
- 登录后的浏览器脚本异常写入 `product_events.event_name = client_error`。
- 所有 API 错误继续返回 `requestId`，可用它在日志和事件表中对齐一次请求。
- `product_events` 开启 RLS，浏览器不能读取或直接写入。

查看最近错误：

```sql
select event_name, request_id, properties, occurred_at
from public.product_events
where event_name in ('server_error', 'client_error')
order by occurred_at desc
limit 100;
```

## 3. 宕机检查

一次性公网验收：

```sh
./scripts/check-public.sh https://jiyuan.online
```

服务器的 systemd timer 每分钟自动运行：

```sh
./deploy/china-hk/install-monitor.sh
systemctl list-timers jiyuan-monitor.timer
journalctl -u jiyuan-monitor.service
```

脚本只在状态由正常变故障或由故障恢复时通知，避免每分钟重复刷屏。没有 webhook
时仍会由 systemd 记录执行结果，但无法把提醒发送给人。设置
`ALERT_WEBHOOK_URL` 后重启下一次检查即可生效。

## 4. 反馈邮件

反馈始终先写数据库，邮件只是通知。生产环境补齐：

```text
RESEND_API_KEY=re_...
FEEDBACK_TO_EMAIL=接收反馈的邮箱
RESEND_FROM_EMAIL=机缘 <onboarding@resend.dev>
```

`/api/health` 的 `feedbackEmailConfigured` 会明确显示邮件是否配齐，但不会泄露密钥。

## 5. PC 与国内网络验收

- 手机和平板显示“请使用电脑打开”；窄窗口的 Windows/macOS 不会被误判成手机。
- 发布后分别使用中国电信、联通、移动网络运行 `check-public.sh`，记录 DNS、TLS、
  首字节和总耗时。香港节点不需要备案，但不能保证所有地区跨境线路质量一致。
