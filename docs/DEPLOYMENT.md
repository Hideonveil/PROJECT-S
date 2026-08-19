# 机缘 Web MVP 公网部署手册

目标：把当前 MVP 部署到 Vercel，使用 Supabase 做真实数据库与实时通道，Resend 发送反馈邮件，最终得到公网地址。

当前生产环境：https://project-s-iota.vercel.app
当前代码仓库：https://github.com/Hideonveil/PROJECT-S.git

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
4. 进入 **Project Settings → API**，记录：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（只放服务端）

Realtime 表已由 migration 加入 `supabase_realtime` publication。若在 Dashboard 检查：Database → Replication，确认这些表被选中：
`profiles, match_requests, matches, applications, rooms, room_members, messages, sessions, session_responses, friendships, recent_connections`

## 2. Resend

1. 注册 https://resend.com 。
2. 打开 **API Keys**，创建 Key，例如 `re_xxxxxxxx`，保存为 `RESEND_API_KEY`。
3. MVP 阶段发送地址直接使用 Resend 提供的 `onboarding@resend.dev`：
   - `RESEND_FROM_EMAIL=NODE <onboarding@resend.dev>`
   - 该地址只能向你的账号邮箱发送，因此接收邮箱填你自己的 `FEEDBACK_TO_EMAIL=2716374688@qq.com`。
4. 如果以后想给任意用户发邮件，需要验证自己的域名（Resend → Domains → Add Domain，添加 DNS 记录），然后把 `RESEND_FROM_EMAIL` 改成 `NODE <noreply@你的域名>`。

## 3. 本地配置

```bash
cd project-s
cp .env.example .env.local
```

`.env.local` 内容：

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_...
FEEDBACK_TO_EMAIL=2716374688@qq.com
RESEND_FROM_EMAIL=NODE <onboarding@resend.dev>
```

启动：

```bash
pnpm install
pnpm dev
```

## 4. GitHub

当前仓库已连接：https://github.com/Hideonveil/PROJECT-S.git，分支 `main`。

```bash
cd project-s
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
| `RESEND_API_KEY` | Resend API key |
| `FEEDBACK_TO_EMAIL` | `2716374688@qq.com` |
| `RESEND_FROM_EMAIL` | `NODE <onboarding@resend.dev>` |

5. 点击 **Deploy**。
6. 当前生产地址为 https://project-s-iota.vercel.app；以后可绑定正式域名，不需要改代码。

## 6. 公网测试方法

使用两台设备（或浏览器无痕窗口）打开公网地址：

1. 设备 A：用用户名注册 → 创建游戏身份（昵称/头像/性别/设备/常玩游戏类型）→ 摇人首页 → 选择游戏、模式、时间和语音偏好 → 开始匹配。
2. 设备 B：同样注册并创建游戏身份，选择相同或兼容的匹配需求。
3. 双方都会看到匹配池人数实时变化，并互相出现在匹配结果。
4. A 点“申请一起玩”，B 收到申请 → 接受 → 进入临时房间。
5. 房间里可实时文字聊天；任一方结束游戏，双方选择是否再次一起玩。
6. 双方都选“愿意”后，自动进入好友/搭子列表。
7. 任一账号在“我的 → 提交反馈”，检查 2716374688@qq.com 是否收到邮件。

## 7. 反馈邮件验证

- 正常：提交反馈后立即收到 `[MVP Feedback] 昵称 - 反馈类型` 邮件。
- 数据库：Supabase Dashboard → Table Editor → `feedback`，能看到新行，`email_status=sent`、`email_sent_at` 有值。
- 邮件失败但不丢数据：临时把 `RESEND_API_KEY` 改成无效值，再提交一条反馈。反馈行仍然存在，`email_status=failed`，`email_error` 有错误信息，页面仍提示“反馈已收到”。

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
