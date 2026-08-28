# PROJECT-S · 找到马上能一起玩的真实玩家（公网 Web MVP）

当前版本使用 Supabase 承载账号、匹配、房间、关系与实时数据。腾讯云中国香港
轻量服务器是正式生产入口；Vercel 保留为独立回滚入口。

## 当前产品流程

用户名注册/登录
→ 创建游戏身份（昵称 / 头像 / 性别 / 设备 / 常玩游戏类型）
→ 摇人首页（游戏 / 冲分或休闲 / 段位或人数意图 / 麦克风）
→ 点击开始后立即进入 Room 外壳
→ 后台持续匹配与 Room 补人
→ Ranked 找到一位合法队友后停止招募
→ Casual 满员或成员共同停止招募后锁定
→ Session ready / playing
→ 实时文字聊天
→ 拜拜 / 离开 / Session 结算
→ 好友 / 游戏搭子
→ 提交反馈（保存到 Supabase，由内部 OPS 处理）

Room 是玩家摇人后共同停留、聊天和等待队友的空间；Session 是 Room
内一次正式游戏过程。恢复资格统一由服务端 Room read model 裁决，不能仅凭历史
`room_members` 记录恢复旧 Room。

## 新增游戏扩展约束

后续游戏必须通过共享 `GameDefinition` 注册表和游戏规则适配器接入，不能在页面、
Matcher、Room 或 Session 通用流程中继续散落游戏名判断。通用生命周期保持一套，
每款游戏只提供自己的配置步骤、段位/位置词汇、兼容性规则、人数上限、资源和展示文案。
正式接入第二款游戏前，必须先用 fake game 通过配置、匹配、Room、Session 和容量 runner
合同测试。完整决策见 `docs/project/DECISIONS.md` 的 DEC-015。

## 技术栈

- Next.js + React + TypeScript（App Router：API 与静态托管）
- Supabase：PostgreSQL、Auth（用户名 + 密码）、Realtime、RLS
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
│   ├── js/api.js            # API 客户端
│   ├── js/auth-controller.js
│   ├── js/room-chat-controller.js
│   ├── js/realtime.js       # Supabase Realtime 订阅
│   ├── js/pages/            # 页面组件：摇人/社区/匹配/结果/房间/好友/我的等
│   └── styles/
├── src/
│   ├── app/api/             # Vercel Serverless API
│   └── lib/
│       ├── matchmaking/     # 调度、Ranked、Casual、Direct Join、状态读取
│       └── room-read-model.ts # Room恢复资格、快速外壳与完整 hydration
├── supabase/migrations/
│   ├── 0001_init.sql        # 基础表结构 + RLS + Realtime
│   ├── 0002_profiles_gender.sql
│   ├── 0003_profiles_genres.sql
│   ├── 0004_deadlock_genshin_match_details.sql
│   ├── 0005_room_lifecycle.sql
│   ├── 0006_phase1_mvp_closure.sql
│   ├── 0007_profiles_age_range.sql
│   └── 0008_restrict_auth_helpers.sql
├── docs/project/DECISIONS.md # 产品与架构稳定决策
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
