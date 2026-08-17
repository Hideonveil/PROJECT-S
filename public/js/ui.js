import { icon } from "./icons.js";
import { avatarWrap } from "./avatar.js";
import { GAME_BY_ID } from "./data.js";

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
  return `<img class="brand-mark" src="/assets/project-s-mark.svg" width="${size}" height="${size}" alt="" aria-hidden="true" />`;
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

export function playerCard(candidate, { pending = false } = {}) {
  const isTeam = candidate.kind === "team";
  const reasons = (candidate.reasons || []).slice(0, 4);
  return `<article class="player-card" data-card-id="${escAttr(candidate.id)}">
    <div class="player-card-top">
      ${avatarWrap(candidate.avatarKey, 66, candidate.online)}
      <div class="player-card-meta">
        <div class="player-card-kind">${isTeam ? "队伍 · " : "玩家 · "}${esc(candidate.device)}</div>
        <div class="player-card-name">${esc(candidate.name)}</div>
        <div class="player-card-handle">${esc(candidate.handle)}</div>
        ${candidate.online ? statusPill("LIVE") : statusPill("OFFLINE")}
      </div>
      ${typeof candidate.matchScore === "number" ? `<div class="player-card-score"><strong>${Math.round(candidate.matchScore)}%</strong><span>匹配度</span></div>` : ""}
    </div>
    ${needSummary(candidate.need, { compact: true })}
    <div class="section" style="gap:8px">
      <div class="section-note">为什么推荐</div>
      <div class="chip-group">
        ${reasons.map((r) => `<span class="reason-tag">${icon("link2", 12)}${esc(r)}</span>`).join("")}
      </div>
    </div>
    <div class="player-card-actions">
      ${button({ label: "查看主页", action: "view-profile", value: candidate.id, kind: "outline", size: "sm", iconName: "user" })}
      ${pending
        ? `<span class="status-pill status-pill--live"><span class="dot"></span>已邀请</span>`
        : button({ label: isTeam ? "邀请加入" : "邀请一起玩", action: "apply-partner", value: candidate.id, kind: "primary", size: "sm", iconName: "send" })}
    </div>
  </article>`;
}

export function homeShell(state, content, active = "home") {
  const resolvedActive = active === "community" ? "community" : active === "me" || active === "friends" || active === "connections" ? "me" : active === "home" ? "match" : "none";
  const sectionLabel = resolvedActive === "match" ? "摇人" : resolvedActive === "community" ? "社区" : resolvedActive === "me" ? "我的" : active === "auth" ? "账号" : "玩家身份";
  const navItems = [
    { id: "match", label: "摇人", href: "#/home", icon: "userPlus" },
    { id: "community", label: "社区", href: "#/community", icon: "users" },
    { id: "me", label: "我的", href: "#/me", icon: "user" },
  ];
  const warningText = `<span>总有人想一起玩</span><i>/</i><b>NEVER PLAY ALONE</b><i>/</i>`;
  const account = state.authenticated
    ? `<button class="product-account product-account--signed" type="button" data-action="go-me">${avatarWrap(state.user.avatarKey, 34, state.user.online)}<span>${esc(state.user.nickname)}</span></button>`
    : `<div class="product-account"><span class="product-account-icon">${icon("user", 18)}</span><div><b>未登录</b><span><button type="button" data-action="open-auth-login">登录</button> / <button type="button" data-action="open-auth-register">注册</button></span></div></div>`;

  return `<div class="product-shell">
    <aside class="product-rail">
      <a class="product-brand" href="#/home" aria-label="PROJECT-S 首页">${brandMark(54)}<strong>PROJECT-S</strong></a>
      <nav class="product-nav" aria-label="主导航">
        ${navItems.map((n) => `<a class="product-nav-link ${resolvedActive === n.id ? "is-active" : ""}" href="${n.href}" data-nav>${icon(n.icon, 24)}<span>${n.label}</span></a>`).join("")}
      </nav>
      <div class="product-rail-footer">${account}</div>
    </aside>
    <div class="product-surface">
      <header class="product-topbar">
        <span class="product-topbar-kicker"><i>PROJECT-S /</i><b>${sectionLabel}</b></span>
        ${state.authenticated
          ? `<button type="button" class="product-topbar-user" data-action="go-me">${esc(state.user.nickname)}</button>`
          : `<div class="product-auth-actions"><button type="button" data-action="open-auth-login">登录</button><button class="product-register" type="button" data-action="open-auth-register">注册</button></div>`}
      </header>
      <main class="home-main">${content}</main>
    </div>
    <div class="product-ticker" aria-label="总有人想一起玩">
      <div class="product-ticker-track"><div class="product-ticker-group">${warningText.repeat(4)}</div><div class="product-ticker-group" aria-hidden="true">${warningText.repeat(4)}</div></div>
    </div>
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
