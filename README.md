# PROJECT-S · 找到马上能一起玩的真实玩家（公网 Web MVP）

当前版本使用 Supabase 承载账号、匹配、房间、关系与实时数据。腾讯云中国香港
轻量服务器是正式生产入口；Vercel 保留为独立回滚入口。

## 当前产品流程

用户名注册/登录
→ 创建游戏身份（昵称 / 头像 / 性别 / 设备 / 常玩游戏类型）
→ 摇人首页（游戏 / 模式 / 开始时间 / 语音偏好）
→ 实时匹配池
→ 匹配结果
→ 玩家主页
→ 申请一起玩
→ 临时房间
→ 实时文字聊天
→ 游戏结束
→ 双向再连接
→ 好友 / 游戏搭子
→ 提交反馈（保存到 Supabase + Resend 邮件）

## 技术栈

- Next.js + React + TypeScript（App Router：API 与静态托管）
- Supabase：PostgreSQL、Auth（用户名 + 密码）、Realtime、RLS
- Resend：反馈邮件
- Vercel：备用部署与回滚入口
- Docker + Caddy：腾讯云中国香港部署、HTTPS 与 Supabase 同域代理

## 公网地址

生产环境：https://jiyuan.online

备用环境：https://project-s-iota.vercel.app

当前唯一 canonical 本地源码根目录：
`/Users/jasonhu/Documents/ChatGPT/project/JY_source`

`PROJECT-S` 仅保留为历史产品名/GitHub remote 名；不要建立或使用第二个完整本地副本。

## 项目结构

```text
JY_source/
├── public/                  # 前端页面、JS、样式
│   ├── index.html
│   ├── js/api.js            # API 客户端 + Supabase 用户名/密码会话
│   ├── js/realtime.js       # Supabase Realtime 订阅
│   ├── js/pages/            # 页面组件：摇人/社区/匹配/结果/房间/好友/我的等
│   └── styles/
├── src/
│   ├── app/api/             # Vercel Serverless API
│   └── lib/                 # Supabase 客户端、鉴权、匹配、反馈邮件
├── supabase/migrations/
│   ├── 0001_init.sql        # 基础表结构 + RLS + Realtime
│   ├── 0002_profiles_gender.sql
│   ├── 0003_profiles_genres.sql
│   ├── 0004_deadlock_genshin_match_details.sql
│   ├── 0005_room_lifecycle.sql
│   ├── 0006_phase1_mvp_closure.sql
│   ├── 0007_profiles_age_range.sql
│   └── 0008_restrict_auth_helpers.sql
├── docs/DEPLOYMENT.md
├── .env.example
└── README.md
```

## 本地运行

```bash
pnpm install
cp .env.example .env.local   # 填入真实值
pnpm dev
```

打开 http://localhost:3000。

## 环境变量

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPS_TOKEN=
ALERT_WEBHOOK_URL=
```

`SUPABASE_SERVICE_ROLE_KEY` 只允许出现在服务端环境变量，绝不能放进 `NEXT_PUBLIC_*`。

## 用户反馈

提交反馈时：

1. 先写入 Supabase `feedback` 表
2. `/ops` 的“联系我们收件箱”直接读取并展示
3. OPS 每 30 秒静默刷新；反馈不再发送邮件

完整部署与测试步骤见 docs/DEPLOYMENT.md。

P1 运营指标、错误记录、在线监控和公网自检见 `docs/P1-OPERATIONS.md`。

中国香港验证环境的部署文件与操作说明见
`deploy/china-hk/README.md`。该方案不迁移 Supabase 数据，Vercel 可继续作为回滚入口。
