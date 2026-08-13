# NODE Web MVP 公网部署手册

目标：把当前 MVP 部署到 Vercel，使用 Supabase 做真实数据库与实时通道，Resend 发送反馈邮件，最终得到 `https://项目名.vercel.app` 公网地址。

---

## 1. Supabase

1. 打开 https://supabase.com 注册并创建一个 Project（Region 建议选 Singapore，接近国内用户）。
2. 左侧进入 **Authentication → Providers**，打开 **Email**。可选开启 **Confirm email**（推荐开启，注册后需到邮箱验证才能登录）。当前 MVP 使用邮箱 + 密码注册/登录，不再使用匿名账号。
3. 进入 **SQL Editor**，把 `supabase/migrations/0001_init.sql` 全部内容粘贴执行。
   - 创建 `games / profiles / user_games / match_requests / matches / applications / rooms / room_members / messages / sessions / friendships / feedback`
   - 种子 6 个真实游戏：我的世界、星露谷物语、PUBG、无畏契约、王者荣耀、英雄联盟
   - 启用 RLS、索引、Realtime 发布
4. 进入 **Project Settings → API**，记录：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（只放服务端）

Realtime 表已由 migration 加入 `supabase_realtime` publication。若在 Dashboard 检查：Database → Replication，确认这些表被选中：
`profiles, match_requests, matches, applications, rooms, room_members, messages, sessions, friendships`

## 2. Resend

1. 注册 https://resend.com 。
2. 打开 **API Keys**，创建 Key，例如 `re_xxxxxxxx`，保存为 `RESEND_API_KEY`。
3. MVP 阶段发送地址直接使用 Resend 提供的 `onboarding@resend.dev`：
   - `RESEND_FROM_EMAIL=NODE <onboarding@resend.dev>`
   - 该地址只能向你的账号邮箱发送，因此接收邮箱填你自己的 `FEEDBACK_TO_EMAIL=2716374688@qq.com`。
4. 如果以后想给任意用户发邮件，需要验证自己的域名（Resend → Domains → Add Domain，添加 DNS 记录），然后把 `RESEND_FROM_EMAIL` 改成 `NODE <noreply@你的域名>`。

## 3. 本地配置

```bash
cd outputs/web-mvp
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

1. 在 GitHub 新建一个空仓库，例如 `node-web-mvp`（不要勾选 README）。
2. 本地初始化并推送：

```bash
cd outputs/web-mvp
git init
git add .
git commit -m "deployable NODE web MVP with Supabase + Resend"
git branch -M main
git remote add origin git@github.com:你的用户名/node-web-mvp.git
git push -u origin main
```

`.env`、`.env.local`、`node_modules`、`.next` 已由 `.gitignore` 排除。

## 5. Vercel

1. 打开 https://vercel.com ，用 GitHub 登录。
2. **Add New → Project → Import** 选择 `node-web-mvp`。
3. Framework 自动识别为 Next.js，无需额外命令。
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
6. 完成后得到类似 `https://node-web-mvp.vercel.app` 的公网地址。可后续在 Vercel → Settings → Domains 绑定自己的域名，不需要改代码。

## 6. 公网测试方法

使用两台设备（或浏览器无痕窗口）打开公网地址：

1. 设备 A：进入 → 创建游戏身份（昵称/头像/设备/常玩游戏）→ 首页 → 开始匹配 → 填写需求。
2. 设备 B：同样注册并创建相同游戏的需求。
3. 双方都会看到匹配池人数实时变化，并互相出现在匹配结果。
4. A 点“申请一起玩”，B 收到弹窗 → 接受 → 进入临时房间。
5. 任一方点“开始游戏”→“结束游戏”→ 双方选择“再玩一局”。
6. 双方都选“愿意”后，进入好友列表。
7. 任一账号在“我的”提交反馈，检查 2716374688@qq.com 是否收到邮件。

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

- 当前 MVP 用 Supabase 匿名账号保存身份；同一浏览器重新打开仍是同一账号，清除浏览器数据会得到新账号。
- 头像支持预设与本地图片上传（Data URL 直接存 Supabase，MVP 足够用）。
- 匹配候选按“同游戏 + 活动/时间/人数/语音/目标”加权排序，无复杂 AI。
- 公网版本保留现有 UI 与功能，没有新增产品功能。