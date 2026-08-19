# 机缘 · 中国香港验证环境

这是当前 MVP 的最低风险部署方式：只迁移 Next.js 网页和 API，现有
Supabase、用户数据与 Vercel 备份均保持不动。

## 服务器

- 腾讯云轻量应用服务器，中国香港
- Ubuntu 24.04 LTS
- 最低 2 核 2GB、40GB SSD、4Mbps
- 安全组仅开放 TCP 22、80、443，以及 UDP 443

## 首次部署

1. 安装 Git、Docker Engine 和 Docker Compose Plugin。
2. 将仓库放到 `/opt/jiyuan`。
3. 复制并填写生产环境变量：

   ```sh
   cd /opt/jiyuan/deploy/china-hk
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

4. 将域名 A 记录指向服务器公网 IP，TTL 暂设为 300 秒。
5. 执行：

   ```sh
   ./deploy.sh
   ```

Caddy 会自动申请并续期 HTTPS 证书。浏览器访问 Supabase 的 Auth、REST、
Storage 和 Realtime 路径时，会通过同一域名转发；服务器端数据库请求保持
直连，避免不必要的回环。

## 更新

当前服务器上的 `/opt/jiyuan` 是生产副本，不是 Git 仓库。请从已经通过测试的
本地项目目录同步代码，并明确排除生产密钥和构建产物：

```sh
rsync -az \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='playwright-report/' \
  --exclude='test-results/' \
  --exclude='deploy/china-hk/.env.production' \
  ./ ubuntu@124.156.175.247:/opt/jiyuan/

ssh ubuntu@124.156.175.247 /opt/jiyuan/deploy/china-hk/deploy.sh
```

同步前必须先执行 `pnpm verify` 和 `pnpm exec playwright test`。生产环境变量只
保存在服务器，不应被 rsync、Git 或日志覆盖。后续如改为 GitHub Actions，应先
把服务器改成 deploy key 管理的 Git 工作副本，再替换本流程。

## 验收

```sh
curl -fsS https://你的域名/api/config
curl -fsS https://你的域名/api/health
docker compose --env-file deploy/china-hk/.env.production \
  -f deploy/china-hk/compose.yaml ps
```

必须额外使用两个真实浏览器账号验证登录、Realtime、匹配、双方确认、房间、
拜拜、评价和好友关系。验证完成前不要关闭 Vercel，也不要迁移或清理 Supabase。
