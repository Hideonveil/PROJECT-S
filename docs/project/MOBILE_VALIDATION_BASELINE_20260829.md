# Phase 1｜手机端验证基线

> 日期：2026-08-29（Asia/Shanghai）
>
> 状态：`M1 BASELINE COMPLETE / MOBILE IMPLEMENTATION NOT STARTED`

## 当前事实

Production 仍主动显示 `pc-only-gate`。本基线不把该 Gate 当成手机产品完成，而是把它记录成 Phase 0
现状；M3 手机外壳完成时，必须用真正的手机完整链路测试替换该契约。

## 自动化视口

| 类型 | 尺寸 |
| --- | --- |
| Mobile compact | 360×800 |
| iPhone compact | 375×812 |
| iPhone regular | 390×844 |
| Android regular | 412×915 |
| iPhone large | 430×932 |
| Desktop compact | 1366×768 |
| Desktop standard | 1440×900 |
| Desktop large | 1920×1080 |

桌面回归继续包含窄桌面窗口，确保窗口变窄不会被误判成触屏手机。
自动化还覆盖 1152×720 的 CSS 视口（1440×900 在 125% 浏览器缩放下的等效布局宽度）；真正浏览器缩放与
操作系统字体缩放仍留到 M7 真机矩阵，不能把等效视口误报成真机缩放验收。

## Phase 1 必须替换的契约

M3/M4 实施时，手机 Gate 测试必须改成：

```text
Hero / Auth / Welcome 可用
→ 游戏选择可用
→ 配置步骤可用
→ Room shell 可用
→ 没有横向溢出
```

M5 实施时继续增加：

```text
成员局部加入
双向聊天
聊天独立滚动
软键盘不遮挡输入
停止招募 / 拜拜 / 退出有即时反馈
Realtime / hydration 不重建整个 Room
```

M7 再加入 Safari、Chrome、iOS 微信、Android 微信真机恢复测试。

## M1 边界

- 本阶段只建立测试护栏和现状基线；
- 不删除 `pc-only-gate`；
- 不修改 Matching、Room、Session 或数据库；
- 不把“Gate 能显示”继续解释为手机版 PASS。
