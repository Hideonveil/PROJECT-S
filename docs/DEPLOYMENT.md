# 机缘 Web MVP 公网部署手册

目标：把当前 MVP 部署到 Vercel，使用 Supabase 做真实数据库与实时通道，Resend 发送反馈邮件，最终得到公网地址。

当前 Production 正式入口：https://www.jiyuan.online
Vercel 备用入口：https://project-s-iota.vercel.app
当前代码仓库：https://github.com/Hideonveil/PROJECT-S.git

当前唯一 canonical 本地源码根目录：
`/Users/jasonhu/Documents/ChatGPT/project/JY_source`

`PROJECT-S` 是 GitHub remote / 历史产品名，不代表第二个本地源码副本。不要从旧的
`output/jiyuan-computer-handoff-2026-08-22/project-s-source` 或已归档的
`PROJECT-S` 目录部署。

中国用户验证阶段采用“双环境”方式：Vercel 保留作为回滚入口，腾讯云中国香港
轻量服务器承载网页、API 与 Supabase 同域代理。香港部署说明见
`deploy/china-hk/README.md`；验证完成前不迁移或清理现有 Supabase 数据。

---

## 1. Supabase

1. 打开 https://supabase.com 注册并创建一个 Project（Region 建议选 Singapore）。
2. 当前 MVP 使用“用户名 + 密码”注册/登录，不依赖邮箱验证；服务端会把用户名映射成私有合成邮箱后创建账号。
3. 进入 **SQL Editor**，按顺序执行迁移：
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_profiles_gender.sql`
   - `supabase/migrations/0003_profiles_genres.sql`
   - `supabase/migrations/0004_deadlock_genshin_match_details.sql`
   - `supabase/migrations/0005_room_lifecycle.sql`
   - `supabase/migrations/0006_phase1_mvp_closure.sql`
   - `supabase/migrations/0007_profiles_age_range.sql`
   - `supabase/migrations/0008_restrict_auth_helpers.sql`
   创建并升级账号、匹配、房间、Session、最近连接、产品事件等数据结构，同时启用 RLS、索引与 Realtime 发布。

   上述 `0001`–`0008` 仅是历史 bootstrap 列表，不是当前 Production replay 指令。当前
   canonical source 包含 34 个 migration；Production migration provenance 以
   `docs/project/MIGRATION_PROVENANCE.md` 为准。不要为了“补齐历史”重放、改写或 repair
   `schema_migrations`；新的数据库变化必须使用 forward-only migration。
4. 进入 **Project Settings → API**，记录：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（只放服务端）

Realtime 表已由 migration 加入 `supabase_realtime` publication。若在 Dashboard 检查：Database → Replication，确认这些表被选中：
`profiles, match_requests, matches, applications, rooms, room_members, messages, sessions, session_responses, friendships, recent_connections`

## 2. 本地配置

```bash
cd /Users/jasonhu/Documents/ChatGPT/project/JY_source
cp .env.example .env.local
```

`.env.local` 内容：

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

启动：

```bash
pnpm install
pnpm dev
```

## 4. GitHub

当前仓库已连接：https://github.com/Hideonveil/PROJECT-S.git，分支 `main`；本地 canonical root 为
`/Users/jasonhu/Documents/ChatGPT/project/JY_source`。

```bash
cd /Users/jasonhu/Documents/ChatGPT/project/JY_source
git add .
git commit -m "update"
git push origin main
```

`.env`、`.env.local`、`node_modules`、`.next` 已由 `.gitignore` 排除，不要把任何 Secret 提交。

## 5. Vercel

1. 打开 https://vercel.com ，用 GitHub 登录。
2. **Add New → Project → Import** 选择 `PROJECT-S`。
3. **Root Directory** 保持仓库根目录，Framework 自动识别为 Next.js。
4. 在 Environment Variables 添加：

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

5. 点击 **Deploy**。
6. 当前 Production 地址为 https://www.jiyuan.online；Vercel
   https://project-s-iota.vercel.app 仅作为备用入口，不改变 canonical source。

## 6. 公网测试方法

使用两台设备（或浏览器无痕窗口）打开公网地址：

1. 设备 A：用用户名注册 → 创建游戏身份（昵称/头像/性别/设备/常玩游戏类型）→ 摇人首页 → 选择游戏、模式、时间和语音偏好 → 开始匹配。
2. 设备 B：同样注册并创建游戏身份，选择相同或兼容的匹配需求。
3. 双方都会看到匹配池人数实时变化，并互相出现在匹配结果。
4. A 点“申请一起玩”，B 收到申请 → 接受 → 进入临时房间。
5. 房间里可实时文字聊天；任一方结束游戏，双方选择是否再次一起玩。
6. 双方都选“愿意”后，自动进入好友/搭子列表。
7. 任一账号在摇人页提交“联系我们”，检查 `/ops` 收件箱是否自动出现新记录。

## 7. 用户反馈验证

- 正常：提交反馈后页面提示已进入运营台。
- OPS：最迟 30 秒后“联系我们收件箱”出现新记录，切回 OPS 标签页时会立即刷新。
- 数据库：Supabase Dashboard → Table Editor → `feedback` 能看到对应新行。

## 8. RLS 验证

在 Supabase Dashboard 的 SQL Editor 用普通 `anon` key 无法通过客户端读取他人反馈。数据库策略：

- 用户只能插入/读取自己的反馈
- 客户端不能修改 `email_status / email_sent_at / email_error`
- 房间只有成员可见
- 会话只有参与者可见
- 好友关系只对双方可见

服务端使用 Service Role Key 完成跨用户操作（建房、结算、发邮件状态更新），该 Key 不暴露到浏览器。

## 9. 已知边界

- 账号为“用户名 + 密码”；用户名会被映射成一个私有合成邮箱（`u<sha256>@mvp.local`），用户无需真实邮箱。
- 头像支持预设与本地图片上传（Data URL 存 Supabase，MVP 足够用）。
- 匹配候选按“同游戏 + 活动/时间/人数/语音/目标”加权排序，无复杂 AI。
- 社区当前为 Coming Soon；MVP 核心是摇人、房间、Session 结束和关系沉淀闭环。
