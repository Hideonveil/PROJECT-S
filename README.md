# NODE · 实时游戏活动匹配平台（公网 Web MVP）

保留现有 NODE 产品与 UI，把本地单机 Demo 的数据层迁移到 Supabase，并部署到 Vercel 公网。

## 技术栈

- Next.js + React + TypeScript（App Router，仅提供 API 与静态托管）
- Supabase：PostgreSQL、Auth（邮箱登录）、Realtime、RLS
- Resend：反馈邮件
- Vercel：部署与临时域名

## 当前产品流程

邮箱注册/登录 → 创建游戏身份 → 首页 → 填写当前需求 → 实时匹配池 → 匹配结果 → 玩家主页 → 申请一起玩 → 临时房间 → 游戏结束 → 双向再连接 → 好友/搭子 → 反馈邮件。

## 项目结构

```text
web-mvp/
├─ public/                  # 现有 MVP 前端（页面、JS、样式、Supabase UMD）
│  ├─ index.html
│  ├─ js/api.js             # API 客户端 + Supabase 邮箱登录
│  ├─ js/realtime.js        # Supabase Realtime 订阅
│  └─ styles/
├─ src/
│  ├─ app/api/              # Vercel Serverless API（匹配/房间/好友/反馈等）
│  └─ lib/                  # Supabase 客户端、鉴权、评分、反馈邮件
├─ supabase/migrations/0001_init.sql
├─ .env.example
└─ docs/DEPLOYMENT.md
```

## 本地运行

```bash
pnpm install
cp .env.example .env.local   # 填入真实值
pnpm dev
```

打开 `http://localhost:3000`。

## 环境变量

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
FEEDBACK_TO_EMAIL=2716374688@qq.com
RESEND_FROM_EMAIL=NODE <onboarding@resend.dev>
```

`SUPABASE_SERVICE_ROLE_KEY` 和 `RESEND_API_KEY` 只允许出现在服务端环境变量，绝不能放进 `NEXT_PUBLIC_*`。

## 反馈邮件

提交反馈时：

1. 先写入 Supabase `feedback` 表
2. 服务端再调用 Resend 发送邮件到 `FEEDBACK_TO_EMAIL`
3. 邮件成功 → `email_status = sent`
4. 邮件失败 → `email_status = failed`，反馈数据仍然保留，用户仍看到“反馈已收到”

完整部署与测试步骤见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。