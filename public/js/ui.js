import { icon } from "./icons.js";
import { avatarWrap } from "./avatar.js";
import { GAME_BY_ID } from "./data.js";

let productRailHeldOpen = false;

export function setProductRailHeldOpen(held) {
  productRailHeldOpen = Boolean(held);
}

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escAttr(value) {
  return esc(value).replaceAll("'", "&#39;");
}

export function brandMark(size = 32) {
  return `<img class="brand-mark" src="/assets/jiyuan-logo-v5.png" width="${size}" height="${size}" alt="机缘" aria-hidden="true" />`;
}

export function registrationStepper(currentStep = 1, steps = ["昵称", "头像", "设备", "游戏类型", "性别"]) {
  return `<div class="registration-stepper" data-registration-stepper aria-label="身份创建进度：第 ${currentStep} 步，共 ${steps.length} 步">
    ${steps
      .map((label, index) => {
        const step = index + 1;
        const status = step < currentStep ? "is-complete" : step === currentStep ? "is-active" : "is-pending";
        return `${index ? `<span class="registration-step-line ${step <= currentStep ? "is-complete" : ""}" aria-hidden="true"><i></i></span>` : ""}<span class="registration-step ${status}"><b>${status === "is-complete" ? icon("check", 14) : step}</b><em>${label}</em></span>`;
      })
      .join("")}
  </div>`;
}

/* floating game-world fragments: pure CSS shapes, cheap to render */
export function fragments() {
  return `<div class="fragments" aria-hidden="true">
    <span class="frag frag--tri" style="top:5%;right:9%;width:150px;height:132px;--dur:16s;--rot:8deg"></span>
    <span class="frag frag--rhombus frag--mid" style="top:13%;left:7%;width:66px;height:66px;--dur:13s;--delay:-4s"></span>
    <span class="frag frag--pixel frag--desktop-only" style="bottom:18%;right:15%;width:52px;height:52px;--dur:11s;--delay:-2s"></span>
    <span class="frag frag--tri frag--far" style="bottom:6%;left:11%;width:112px;height:98px;--dur:18s;--delay:-7s;--rot:-6deg"></span>
    <span class="frag frag--rhombus frag--far frag--desktop-only" style="top:36%;right:36%;width:38px;height:38px;--dur:12s;--delay:-5s"></span>
    <span class="frag frag--pixel frag--mid frag--desktop-only" style="top:55%;left:20%;width:32px;height:32px;--dur:10s;--delay:-3s"></span>
  </div>`;
}

export function statusPill(status, text = null) {
  const map = {
    LIVE: ["live", "在线"],
    ONLINE: ["live", "在线"],
    MATCHING: ["live", "匹配中"],
    READY: ["live", "已就绪"],
    PLAYING: ["warm", "对局中"],
    ROOM: ["warm", "房间内"],
    CONNECTED: ["live", "已连接"],
    DONE: ["warm", "已结束"],
    OFFLINE: ["", "离线"],
  };
  const [modifier, label] = map[status] || ["", status || "未知"];
  return `<span class="status-pill status-pill--${modifier}"><span class="dot"></span>${esc(text || label)}</span>`;
}

export function button({
  label,
  action,
  value = "",
  kind = "outline",
  size = "",
  iconName = "",
  disabled = false,
  extra = "",
  type = "button",
}) {
  const iconSize = size === "sm" ? 15 : 17;
  return `<button class="btn btn--${kind} ${size ? `btn--${size} ` : ""}${extra}" data-action="${escAttr(
    action
  )}" data-value="${escAttr(value)}" ${disabled ? "disabled" : ""} type="${type}">${
    iconName ? icon(iconName, iconSize) : ""
  }<span>${esc(label)}</span></button>`;
}

function detailLine(details) {
  const parts = [];
  if (details.modpack) parts.push(`整合包 ${details.modpack}`);
  if (details.rank) parts.push(`段位 ${details.rank}`);
  if (details.hero) parts.push(`英雄 ${details.hero}`);
  if (details.role) parts.push(`位置 ${details.role}`);
  if (Array.isArray(details.tags) && details.tags.length) parts.push(details.tags.slice(0, 3).join(" / "));
  if (!parts.length) return "";
  return `<div class="need-line"><span>${icon("badgeCheck", 14)}</span><span>${esc(parts.join(" · "))}</span></div>`;
}

export function needSummary(need, { compact = false, title = "当前需求" } = {}) {
  const game = GAME_BY_ID[need.game] || { name: need.game || "未知游戏" };
  return `<div class="need-block">
    <div class="need-block-label">${icon("radio", 13)}${esc(title)}</div>
    <div class="need-line"><strong>${esc(game.name)}</strong><span>${esc(need.mode || "")}</span></div>
    <div class="need-line"><span>${icon("target", 14)}</span><span>${esc(need.goal || "还没有写目标")}</span></div>
    ${detailLine(need.details || {})}
    <div class="need-line">
      <span>${icon("users", 14)} ${esc(need.current || 1)}/${esc(need.target || 1)} 人</span>
      <span>${icon("clock", 14)} ${esc(need.time || "--:--")}</span>
      <span>${icon("timer", 14)} ${esc(need.duration === "不限" ? "时长不限" : `${need.duration || "60"} 分钟`)}</span>
      <span>${need.voice ? icon("mic", 14) + " 开麦" : icon("volumeX", 14) + " 闭麦"}</span>
    </div>
    ${compact ? "" : `<div class="need-line"><span>${icon("footprints", 14)}</span><span>${esc(need.playerType || "不限")}</span></div>`}
  </div>`;
}

export function homeShell(state, content, active = "home") {
  const resolvedActive = active === "community" ? "community" : active === "me" || active === "friends" || active === "connections" ? "me" : active === "room" ? "room" : active === "home" ? "match" : "none";
  const sectionLabel = resolvedActive === "match" ? "摇人" : resolvedActive === "community" ? "社区" : resolvedActive === "me" ? "我的" : active === "auth" ? "账号" : "玩家身份";
  const navItems = [
    { id: "match", label: "摇人", href: "#/home", icon: "userPlus" },
    { id: "community", label: "社区", href: "#/community", icon: "users" },
    { id: "me", label: "我的", href: "#/me", icon: "user" },
  ];
  if (state.room) navItems.push({ id: "room", label: "进行中的房间", href: "#/room", icon: "radio" });
  const warningText = "总有人想一起玩　/　NEVER PLAY ALONE　/　".repeat(8);
  const account = state.authenticated
    ? `<div class="product-account-menu" data-account-menu>
        <button class="product-account product-account--signed" type="button" data-action="toggle-account-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="product-account-popover">
          <span class="product-account-avatar">${avatarWrap(state.user.avatarKey, 34, state.user.online)}</span><span class="product-account-name">${esc(state.user.nickname)}</span>
        </button>
        <section class="product-account-popover" id="product-account-popover" data-account-popover role="menu" aria-label="玩家菜单" hidden>
          <header class="product-account-popover-head">
            <span class="product-account-popover-avatar">${avatarWrap(state.user.avatarKey, 42, state.user.online)}</span>
            <span><b>${esc(state.user.nickname)}</b><small>${esc(state.user.handle || state.user.friendCode || "JIYUAN PLAYER")}</small></span>
            <em><i></i>在线</em>
          </header>
          <div class="product-account-popover-group">
            <button type="button" data-action="go-me" role="menuitem">${icon("user", 17)}<span>我的资料</span></button>
          </div>
          <div class="product-account-popover-seal" aria-hidden="true"><span>JIYUAN PLAYER / NEVER PLAY ALONE /</span></div>
          <div class="product-account-popover-group product-account-popover-group--exit">
            <button type="button" data-action="logout" role="menuitem">${icon("logOut", 17)}<span>登出账号</span></button>
          </div>
        </section>
      </div>`
    : `<div class="product-account"><span class="product-account-icon">${icon("user", 18)}</span><div><b>未登录</b><span><button type="button" data-action="open-auth-login">登录</button> / <button type="button" data-action="open-auth-register">注册</button></span></div></div>`;

  return `<div class="product-shell">
    <aside class="product-rail ${productRailHeldOpen ? "is-staggered-open is-route-held" : ""}" data-staggered-rail>
      <div class="product-rail-layers" aria-hidden="true"><i class="product-rail-layer product-rail-layer--violet"></i><i class="product-rail-layer product-rail-layer--ink"></i></div>
      <a class="product-brand" href="#/hero" aria-label="机缘首页">${brandMark(54)}<strong>机缘</strong></a>
      <nav class="product-nav" aria-label="主导航">
        ${navItems.map((n) => `<a class="product-nav-link ${resolvedActive === n.id ? "is-active" : ""}" href="${n.href}" data-nav>${icon(n.icon, 24)}<span>${n.label}</span></a>`).join("")}
      </nav>
      <div class="product-rail-footer">${account}</div>
    </aside>
    <div class="product-surface">
      <header class="product-topbar">
        <span class="product-topbar-kicker"><i>机缘 /</i><b>${sectionLabel}</b></span>
        ${state.authenticated
          ? `<div class="product-user-actions"><button type="button" class="product-topbar-user" data-action="go-me"><span>${esc(state.user.nickname)}</span><small>${esc(state.user.handle || state.user.friendCode || state.user.id || "PLAYER")}</small></button><button type="button" class="product-topbar-logout" data-action="logout">${icon("logOut", 15)}<span>登出</span></button></div>`
          : `<div class="product-auth-actions"><button type="button" data-action="open-auth-login">登录</button><button class="product-register" type="button" data-action="open-auth-register">注册</button></div>`}
      </header>
      <main class="home-main">${content}</main>
    </div>
    <div class="product-ticker" data-product-ticker aria-label="总有人想一起玩">
      <div class="product-ticker-track" data-ticker-track aria-hidden="true">
        <span class="product-ticker-text" data-ticker-head>${warningText}</span>
        <span class="product-ticker-text" data-ticker-tail>${warningText}</span>
      </div>
    </div>
    <section class="pc-only-gate" role="dialog" aria-modal="true" aria-labelledby="pc-only-title">
      <div class="pc-only-card"><div class="pc-only-mark">${brandMark(58)}</div><div class="match-eyebrow">PC EXPERIENCE / 机缘</div><h1 id="pc-only-title">请使用电脑打开</h1><p>机缘当前只开放 PC 版。用电脑浏览器进入，才能完整使用摇人、匹配与 Session 房间。</p><div class="pc-only-device">${icon("monitor", 30)}<span><b>推荐设备</b><small>Windows / macOS · Chrome / Edge</small></span></div></div>
      <div class="pc-only-warning"><span>总有人想一起玩</span><i>/</i><b>NEVER PLAY ALONE</b><i>/</i></div>
    </section>
  </div>`;
}

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}
