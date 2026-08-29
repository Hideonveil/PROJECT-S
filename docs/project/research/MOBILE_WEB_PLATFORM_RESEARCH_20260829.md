# 机缘手机 Web 平台约束研究

> 日期：2026-08-29（Asia/Shanghai）  
> 状态：Phase 1 设计输入，不是产品实现  
> 范围：iPhone Safari、Android Chrome、微信内置浏览器、触控与无障碍、聊天滚动、断线恢复、PWA 优先级  
> 约束：只使用标准组织、浏览器厂商或平台厂商的一手资料；MDN 仅作为规范与兼容性汇总。

## 1. 结论摘要

1. 手机端不能用一套 `100vh + position: fixed` 布局硬套 PC。移动浏览器存在 layout viewport、visual viewport、动态浏览器栏、安全区和软键盘等多层约束。
2. 机缘第一版应采用“稳定外壳 + 局部滚动”的竖屏结构：顶部状态、主内容、独立聊天消息区、输入/操作底栏。聊天增长不能把整个 Room 页面撑长。
3. `svh` 适合稳定的最小可见高度，`dvh` 适合跟随浏览器栏变化，但动态单位会触发布局变化；不能在全页面大量滥用 `dvh`。
4. iPhone Safari 和现代 Android Chrome 在软键盘出现时都可能只缩小 visual viewport，而不缩小 layout viewport。聊天输入区要读取 `window.visualViewport` 做渐进增强，不能假设固定底栏自然位于键盘上方。
5. 微信内置浏览器没有找到可公开核实的、覆盖当前 iOS/Android 微信版本的固定内核及 Web API 兼容承诺。不得写“微信一定等于 Safari/Chrome/X5”的分支；必须特性检测并用真实微信版本验收。
6. Web 标准的触控目标最低门槛是 `24 × 24 CSS px` 或满足规定间距；机缘高频操作应采用更宽松的产品目标，避免把最低合规值当设计目标。
7. Realtime/WebSocket 断开后，浏览器不会替业务恢复正确 Room 状态。恢复流程必须是“重新连通 → 服务端重新裁决用户当前 Room/Session → 拉取权威快照 → 再订阅增量事件”，不能只依赖本地缓存或 `navigator.onLine`。
8. PWA/安装能力与手机网页核心体验是两件事。首期可以不做安装、离线缓存和 Service Worker；先把普通浏览器标签页与微信内置浏览器中的完整链路做好。

## 2. 证据分级

本文每项结论按以下标签区分：

- **规范事实**：W3C、WHATWG 等公开规范直接规定的行为或接口。
- **平台事实**：Apple/WebKit、Google/Chrome、Android、腾讯官方材料明确公布的实现行为。
- **工程建议**：根据规范和平台事实，为机缘做出的设计决策；它不是浏览器强制规则。
- **未知 / 必须实测**：公开官方资料无法证明，禁止猜测。

## 3. iPhone Safari：安全区与动态视口

### 3.1 Safe Area

**平台事实**

WebKit 为异形屏提供 `viewport-fit=cover`，并通过以下环境变量暴露安全区：

- `safe-area-inset-top`
- `safe-area-inset-right`
- `safe-area-inset-bottom`
- `safe-area-inset-left`

WebKit 明确建议在采用全屏覆盖后，用这些 inset 保证重要内容不被圆角、传感器区域和 Home Indicator 遮挡，并使用 `max()` 将安全区与常规边距结合，而不是用安全区替代常规边距。

来源：

- [WebKit — Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [W3C — CSS Environment Variables Module Level 1](https://www.w3.org/TR/css-env-1/)
- [MDN — `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)

**对机缘的工程建议**

- 页面 viewport 使用 `width=device-width, initial-scale=1, viewport-fit=cover`。
- 顶部导航、底部聊天输入区和底部主操作区都必须叠加安全区 padding。
- 建立共享 CSS token，而不是每页各写一套：

```css
--safe-top: env(safe-area-inset-top, 0px);
--safe-right: env(safe-area-inset-right, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
--safe-left: env(safe-area-inset-left, 0px);
```

- 底部操作区建议使用 `padding-bottom: max(var(--space), var(--safe-bottom))` 或等价 `calc()`，保证普通矩形屏也有正常留白。
- 不通过 `user-scalable=no` 或极小 `maximum-scale` 禁止用户缩放。WCAG 要求文本可放大到 200% 且不丢失内容或功能。

来源：[W3C WAI — Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)

### 3.2 `vh`、`svh`、`lvh`、`dvh`

**规范事实**

CSS Values Level 4 区分三种移动视口高度：

- `svh`：浏览器动态 UI 完全展开时的较小视口；尺寸稳定且更安全，但 UI 收起后可能留下多余空间。
- `lvh`：浏览器动态 UI 收起时的较大视口；尺寸稳定，但 UI 展开时关键内容可能被遮挡。
- `dvh`：动态视口；能跟随浏览器 UI 变化，但规范明确提醒它可能在滚动中导致内容 resize，并产生干扰或性能成本。

传统 `vh` 为兼容性通常映射到 large viewport，不能假设它永远代表当前真正可见高度。

来源：

- [W3C — CSS Values and Units Level 4, viewport variants](https://www.w3.org/TR/css-values-4/#viewport-variants)
- [WebKit — Safari 15.4 new viewport units](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)

**对机缘的工程建议**

- Room/Matching 外壳用 progressive fallback：`min-height: 100vh; min-height: 100svh;`。
- 需要精确跟随当前可见高度的聊天布局，可以在局部容器使用 `100dvh`，但不要让成员卡、聊天列表和整页多层同时依赖 `dvh`。
- `dvh` 变化时只调整外壳高度，不销毁或重建 Room 组件，不触发数据重取。
- 对 Safari 浏览器栏展开/收起、地址栏位置变化、横竖屏切换分别真机检查，避免“页面每隔几秒闪一下”的布局抖动。

## 4. 软键盘与 VisualViewport

### 4.1 通用模型

**规范事实**

移动网页至少涉及：

- **Layout viewport**：页面布局和许多 fixed/sticky 元素参照的区域。
- **Visual viewport**：用户当前真正看到的区域；缩放或软键盘出现时可以变小。

`window.visualViewport` 提供 `height`、`width`、`offsetTop`、`offsetLeft`、`scale`，以及 `resize` / `scroll` 事件。

来源：

- [W3C — CSSOM View Module](https://www.w3.org/TR/cssom-view-1/)
- [MDN — VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)

### 4.2 iPhone Safari

**平台事实**

WebKit 在 Safari 13 加入 Visual Viewport API，明确说明它会考虑缩放和屏幕键盘，可用于将内容移出键盘遮挡区。

来源：[WebKit — New WebKit Features in Safari 13](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)

WebKit 的公开问题记录还表明，软键盘动画期间 VisualViewport 更新可能延迟，且 WebKit 尚不能依赖 Chrome 的 `interactive-widget=resizes-content` 行为。问题记录是平台风险证据，不应当被误解为所有版本都必然触发同一 Bug。

来源：

- [WebKit Bug 265578 — Visual viewport height updated late](https://bugs.webkit.org/show_bug.cgi?id=265578)
- [WebKit Bug 259770 — `interactive-widget` support](https://bugs.webkit.org/show_bug.cgi?id=259770)

### 4.3 Android Chrome

**平台事实**

从 Chrome 108 起，Android Chrome 默认在软键盘出现时只 resize visual viewport，不再 resize layout viewport，以与 iOS Safari 的大方向一致。Chrome 提供 `interactive-widget` viewport meta 值：

- `resizes-visual`
- `resizes-content`
- `overlays-content`

Chrome 官方同时说明，这项变化不自动覆盖所有 Android WebView。

来源：[Chrome for Developers — Viewport resize behavior](https://developer.chrome.com/blog/viewport-resize-behavior/)

**对机缘的工程建议**

- 默认按 `resizes-visual` 心智模型设计，避免为 Android 强制 `resizes-content` 后又与 Safari 形成两套布局逻辑。
- 聊天输入框 focus 后：读取 `visualViewport.height/offsetTop`，只更新一个 CSS 自定义属性或外壳尺寸；使用 `requestAnimationFrame` 合并 resize/scroll 事件，避免每个事件都引发 React 全树更新。
- 键盘关闭后恢复布局，但保持 Room、成员、聊天和输入草稿状态；禁止因为 viewport resize 重新 hydration。
- 不把键盘高度写成设备型号常量。
- 不依赖 `window.innerHeight` 单独判断键盘；它和 VisualViewport 在不同平台的含义可能不同。
- 验收必须包含：输入框首次聚焦、连续开关键盘、中文输入法候选栏、发送消息后键盘保持/收起、旋转屏幕后再输入。

## 5. 微信内置浏览器

### 5.1 能确认的事实

**平台事实**

腾讯公开的 X5 WebView API 说明 X5 是一个可配置的 WebView 实现，具有内核版本、暂停/恢复、User-Agent 和 viewport 设置接口。

来源：

- [腾讯 X5 — WebView API](https://x5.tencent.com/docs/tbsapi/reference/com/tencent/smtt/sdk/WebView.html)
- [腾讯 X5 — WebSettings API](https://x5.tencent.com/docs/tbsapi/reference/com/tencent/smtt/sdk/WebSettings.html)

### 5.2 不能确认的内容

**未知 / 必须实测**

本次没有找到腾讯/微信公开官方资料，能够保证：

- 当前所有 Android 微信版本固定使用某一 X5/Chromium 版本；
- 当前所有 iOS 微信版本与同系统 Safari 的 viewport、键盘、缓存、WebSocket 行为完全一致；
- 微信内置浏览器对 `dvh`、VisualViewport、overscroll、BFCache 的支持永远与外部浏览器同步。

MDN 的 Baseline 兼容结论也明确不覆盖操作系统 WebView 等嵌入式浏览器，因此不能用“Safari/Chrome 已支持”直接替代微信验收。

来源：[MDN — Baseline compatibility scope](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)

**对机缘的工程建议**

- 微信作为独立的正式测试目标，而不是 UA 别名。
- 使用 feature detection：检测 `window.visualViewport`、CSS `dvh/svh`、`env()`、`overscroll-behavior`；不靠 UA 字符串决定业务路径。
- 核心功能必须在不依赖微信 JS-SDK 的普通 H5 模式工作；只有明确需要微信能力时才接 JS-SDK。
- 建立最小真机矩阵：iOS 微信最新稳定版、Android 微信最新稳定版；至少一台较旧 Android 设备用于性能和 WebView 差异检查。
- 重点测：OAuth/登录返回、页面前后台切换、键盘、聊天滚动、WebSocket 重连、系统返回键/侧滑返回、外链返回、缓存恢复。
- 如果检测到能力缺失，使用 CSS/JS fallback；不要为了微信复制第二套 Room 或 Matching 状态机。

## 6. 触控目标、Focus 与 Reduced Motion

### 6.1 触控目标

**规范事实**

WCAG 2.2 AA 的 Target Size (Minimum) 要求指针目标至少 `24 × 24 CSS px`，或满足规范规定的间距/例外条件。

来源：[W3C WAI — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

**平台事实**

- Apple 建议 iOS/iPadOS 常用控件采用 `44 × 44 pt` 默认控制尺寸。
- Android 建议交互目标至少 `48 × 48 dp`。

来源：

- [Apple HIG — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Android Developers — Accessibility touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)

**对机缘的工程建议**

平台的 pt、dp 和 Web 的 CSS px 不是同一计量单位，不能直接宣称等价。机缘采用以下产品约束：

- 所有控件满足 WCAG `24 × 24 CSS px` 最低门槛；
- 高频和关键按钮的 CSS hit area 目标至少 `44 × 44 CSS px`；
- “停止招募 / 拜拜 / 溜了 / 退出 / 发送”建议达到 `48px` 高度或等价可点击面积；
- 小图标可视觉上较小，但通过 padding 扩大 hit area；相邻危险操作保持明显间距；
- 所有异步按钮具有 pressed/loading/disabled/result 状态，避免用户重复点击。

### 6.2 `:focus-visible`

**规范事实**

`:focus-visible` 允许浏览器根据输入方式决定何时显示焦点提示；WCAG 2.4.7 要求键盘可操作界面存在可见焦点指示。

来源：

- [W3C — Selectors Level 4 `:focus-visible`](https://www.w3.org/TR/selectors-4/#the-focus-visible-pseudo)
- [W3C WAI — Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)

**对机缘的工程建议**

- 不全局写 `outline: none`。
- 所有卡片、按钮、输入框、快捷消息、弹窗操作都要有统一 `:focus-visible` 样式。
- 手机端依旧保留键盘焦点，因为外接键盘、辅助功能和 Android/iPad 指针输入都可能使用它。
- 输入框获得焦点不能自动提交、切页或重建 Room。

### 6.3 `prefers-reduced-motion`

**规范事实**

`prefers-reduced-motion: reduce` 表达用户希望减少非必要动画；WAI 建议非必要的交互动效能够被关闭或显著减弱。

来源：

- [W3C — Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)
- [W3C WAI — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)

**对机缘的工程建议**

- Room 转场、成员加入、等待 loop、toast、抽屉和弹窗保留状态反馈，但 reduced-motion 下移除位移动画和长循环运动。
- loading 不可以完全消失；改为静态状态、轻微 opacity 或非运动反馈。
- 动画不得阻塞导航、API 请求完成或状态提交。

## 7. 聊天独立滚动

**规范事实**

CSS Overflow 允许元素成为独立 scroll container。CSS Overscroll Behavior 定义 `overscroll-behavior: contain`，用于阻止内部滚动到边界后继续把滚动传给祖先容器；规范也指出，相比用非 passive 事件监听器和 `preventDefault()` 拦滚动，该属性更稳健且不会引入同类滚动延迟。

来源：

- [W3C — CSS Overflow Module Level 3](https://www.w3.org/TR/css-overflow-3/)
- [W3C — CSS Overscroll Behavior Module Level 1](https://www.w3.org/TR/css-overscroll-1/)
- [MDN — `overscroll-behavior`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)

**对机缘的工程建议**

手机 Room 应采用一层主外壳，不让文档随着消息不断增长：

```text
RoomShell
├── CompactHeader
├── MembersAndStatus（内容可收缩/折叠）
├── ChatMessages（唯一主要纵向滚动区）
└── ComposerAndRoomActions（底部安全区内）
```

核心 CSS 结构要求：

```css
.room-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 100svh;
  overflow: hidden;
}

.chat-messages {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
```

额外行为：

- 新消息到达时，只有用户本来接近底部才自动滚到底部；用户查看历史消息时不抢滚动位置。
- 显示“有新消息”按钮，让用户主动回到底部。
- 键盘打开后只调整消息区可用高度，成员区和 Room 状态不重新挂载。
- `overscroll-behavior` 作为渐进增强；微信等环境仍需真机验证，不支持时保持基本滚动可用，不能阻止发送和退出。

## 8. 断线、切后台与恢复

### 8.1 浏览器生命周期

**平台事实 / 规范事实**

移动端切换 App、锁屏或进入后台时，页面可能变为 hidden、frozen、discarded 或 terminated。Chrome 官方指出，移动端 `beforeunload`、`pagehide`、`unload` 不保证触发；冻结时 timers、fetch 回调等任务可能暂停。

来源：

- [Chrome for Developers — Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [W3C — Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/)

WebSocket 标准提供连接状态及 `close/error` 反馈，但没有替应用定义 Room 状态恢复流程；RFC 6455 还警告异常关闭后立即、持续重连可能造成类似拒绝服务的负载。

来源：

- [WHATWG — WebSockets Standard](https://websockets.spec.whatwg.org/)
- [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)

`navigator.onLine` 只能作为提示，MDN 明确称其判断具有内在不可靠性，不应据此禁用功能。

来源：[MDN — `navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)

### 8.2 对机缘的恢复协议建议

```text
网络/页面恢复
→ 建立 Auth 有效性
→ 调用服务端 resolveActiveRoom / state resolver
→ 获得权威 Room + Session + member revision 快照
→ 替换本地陈旧快照
→ 重新订阅 Room/Chat/Presence 增量事件
→ 按 sequence/revision 去重并补缺
→ UI 从 Reconnecting 进入 Live
```

必须满足：

- Realtime 是低延迟通知通道，不是唯一事实源。
- 客户端保存 `room_id`、最后确认 revision/sequence 和未确认 mutation id；不把旧 Room UI 当恢复资格。
- 重连使用有上限的指数退避与 jitter；前台恢复可立即尝试一次，后续退避，避免集体 reconnect storm。
- 每次恢复都重新取权威快照，处理后台期间错过的成员加入、离开、聊天、停止招募和拜拜事件。
- mutation 使用幂等 key；超时后先查询结果再决定是否重试，避免重复聊天、重复退出、重复结算。
- `visibilitychange/pageshow/resume` 是“需要重新核验”的信号，不是“用户已经退出 Room”的证据。
- 断线提示必须区分：正在重连、已恢复、需要重新登录、Room 已结束。
- 不依赖 unload 时发送“退出 Room”；成员离线、主动退出和页面被系统冻结是三种不同状态。

## 9. PWA / 安装：首期不作为必要条件

**规范事实**

Web App Manifest 定义名称、图标、start URL、scope、显示模式等安装元数据；它解决的是安装和独立启动体验，不是普通网页的 Room、键盘、聊天或 Realtime 正确性。

来源：[W3C — Web Application Manifest](https://www.w3.org/TR/appmanifest/)

WebKit 说明 iOS/iPadOS 支持将网站添加到主屏幕，但安装后的存储、Cookie 和启动环境可能与普通浏览器标签存在额外差异。

来源：[WebKit — Safari 17.0 Web Apps](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)

**对机缘的工程建议**

Phase 1 明确不以以下内容为 Gate：

- 安装提示；
- Add to Home Screen 教程；
- standalone/fullscreen 模式；
- Service Worker 离线缓存；
- Web Push；
- 后台持续运行。

原因：这些能力会增加缓存版本、登录隔离、后台生命周期和更新策略的额外测试面，但不会替代当前最需要解决的竖屏布局、软键盘、Room 一致性和断线恢复。

允许保留一个最小 manifest 作为未来入口，但首期不得让 manifest、Service Worker 或安装模式阻塞普通 Web 上线，也不得为了“像 App”而引入旧资源缓存导致 Production 版本错乱。

## 10. 机缘 Phase 1 平台设计计划

### 10.1 共享 Mobile Web Foundation

建立以下共享能力，不复制业务状态：

1. `MobileViewportShell`
   - 安全区 token；
   - `svh/dvh/vh` fallback；
   - VisualViewport 观测；
   - 键盘开关状态；
   - 不因 viewport 变化重建页面。
2. `MobileNavigation`
   - 竖屏导航与返回行为；
   - 与当前 URL/路由一致；
   - 不创造手机专属业务路由事实。
3. `MobileRoomLayout`
   - 共用 PC 的 Room domain data；
   - 成员/状态紧凑展示；
   - Chat 独立滚动；
   - 底部输入与 Room 操作安全区。
4. `ConnectionRecoveryController`
   - 页面生命周期；
   - Realtime 重连；
   - 服务端权威快照恢复；
   - 幂等 mutation；
   - 用户可理解的恢复状态。
5. `MobileInteractionPrimitives`
   - 触控 hit area；
   - pressed/loading/disabled/success/error；
   - `:focus-visible`；
   - reduced motion；
   - toast/dialog/sheet 的一致行为。

### 10.2 不允许出现的实现

- 手机端复制一套 Auth、Matcher、Room 或 Session 状态机；
- 用 UA 字符串为 Safari、Chrome、微信分别维护业务分支；
- 依靠 `100vh` 固定整页高度；
- 软键盘打开就刷新页面、重建 Room 或重新拉取全部状态；
- 聊天消息撑高整个 document；
- 用 `unload` 判断玩家主动离开；
- 用 `navigator.onLine` 决定用户是否可以操作；
- 无上限、无 jitter 的 Realtime 重连；
- 为首期强行加入 Service Worker/PWA 安装 Gate。

### 10.3 第一版实机验收矩阵

| 目标 | 最低覆盖 |
|---|---|
| iPhone Safari | 375 / 390 / 430 CSS px 竖屏；刘海或 Dynamic Island；键盘与安全区 |
| Android Chrome | 360 / 412 CSS px 竖屏；Chrome 最新稳定版；软键盘与系统返回 |
| iOS 微信 | 当前稳定版；登录返回、键盘、聊天、前后台、重连 |
| Android 微信 | 当前稳定版；同上，并确认实际 CSS/API 能力 |
| 放大与字体 | 125%、200% 文本/页面缩放下无核心功能丢失 |
| 动效 | 默认与 reduced-motion 两种设置 |
| 网络 | Wi-Fi → 蜂窝、短断网、后台 40 秒、页面被恢复 |

每个目标至少完整走：

```text
登录
→ 选择游戏和匹配条件
→ Room shell
→ 成员加入
→ 双向聊天/快捷消息/系统消息
→ 键盘开关和聊天滚动
→ 切后台/断网/恢复
→ 停止招募 / 拜拜 / 退出
→ 赛后
→ lifecycle convergence
```

验收时必须记录：

- 是否出现整页闪烁或 Room 重挂载；
- 输入框是否被键盘遮挡；
- 聊天是否只在内部滚动；
- 成员、聊天和系统消息是否双向一致；
- 恢复后是否回到正确 Room/Session；
- 是否产生 duplicate、ghost、active residue；
- 微信环境实际支持的能力，不把实测结果外推成永久平台保证。

## 11. 本研究的明确边界

- 本文是平台约束和设计计划，不代表上述组件已经实现。
- 本文没有修改 Production、数据库、API 或产品代码。
- 微信兼容性结论仅限“公开资料可证明的范围”；具体行为必须在目标微信版本真机验证。
- 浏览器未来版本会变化，实施前与正式开放 Gate 前都应复核 Apple/WebKit、Chrome 与微信当前稳定版本。

## 12. 直接来源索引

### Apple / WebKit

- [Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [Safari 15.4 viewport units](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [Safari 13 Visual Viewport API](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)
- [Safari 17.0 Web Apps](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)
- [Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

### Google / Android / Chrome

- [Chrome Android viewport resize behavior](https://developer.chrome.com/blog/viewport-resize-behavior/)
- [Chrome Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [Android accessibility touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)

### W3C / WHATWG / RFC

- [CSS Values and Units Level 4](https://www.w3.org/TR/css-values-4/)
- [CSS Environment Variables Level 1](https://www.w3.org/TR/css-env-1/)
- [CSSOM View](https://www.w3.org/TR/cssom-view-1/)
- [CSS Overflow Level 3](https://www.w3.org/TR/css-overflow-3/)
- [CSS Overscroll Behavior Level 1](https://www.w3.org/TR/css-overscroll-1/)
- [Selectors Level 4](https://www.w3.org/TR/selectors-4/)
- [Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/)
- [WHATWG WebSockets](https://websockets.spec.whatwg.org/)
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)
- [Web Application Manifest](https://www.w3.org/TR/appmanifest/)

### Tencent / 微信相关

- [腾讯 X5 WebView API](https://x5.tencent.com/docs/tbsapi/reference/com/tencent/smtt/sdk/WebView.html)
- [腾讯 X5 WebSettings API](https://x5.tencent.com/docs/tbsapi/reference/com/tencent/smtt/sdk/WebSettings.html)

### MDN 规范与兼容性汇总

- [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [`env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [`overscroll-behavior`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)
- [`navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [Baseline compatibility scope](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)
