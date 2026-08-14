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
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true"><defs><linearGradient id="ps-prism" x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse"><stop stop-color="#b8a0f0" stop-opacity="0.88"/><stop offset="0.5" stop-color="#c8bcf6" stop-opacity="0.55"/><stop offset="1" stop-color="#b4d8f8" stop-opacity="0.82"/></linearGradient></defs><polygon points="32,3 59,32 32,61 5,32" fill="url(#ps-prism)" stroke="rgba(255,255,255,0.55)" stroke-width="1.4" stroke-linejoin="round"/><polygon points="32,3 59,32 32,34 5,32" fill="#ffffff" fill-opacity="0.16"/><polygon points="32,61 59,32 32,34 5,32" fill="#ffffff" fill-opacity="0.06"/><path d="M32 3 L32 61 M5 32 L59 32 M13 13 L51 51 M51 13 L13 51" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1"/><rect x="50" y="2" width="7" height="7" rx="1.5" transform="rotate(45 53.5 5.5)" fill="#f8d8e8" fill-opacity="0.9"/><rect x="7" y="9" width="5" height="5" rx="1" fill="#222" fill-opacity="0.45"/></svg>`;
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

export function brand(size = 32, tag = true) {
  return `<a class="brand" href="#/home" aria-label="Project-S beta 首页">${brandMark(size)}<span><span class="brand-name">Project-S <span class="brand-beta">beta</span></span>${tag ? `<span class="brand-tag">此刻，一起玩</span>` : ""}</span></a>`;
}

/* large translucent mirror / prism crystals for login atmosphere */
export function mirrors() {
  return `<div class="prism-mirrors" aria-hidden="true">
    <span class="mirror mirror--a"></span>
    <span class="mirror mirror--b"></span>
    <span class="mirror mirror--c"></span>
    <span class="mirror mirror--d"></span>
    <span class="mirror-pixel mirror-pixel--1"></span>
    <span class="mirror-pixel mirror-pixel--2"></span>
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

export function statBlock(label, value, { signal = false } = {}) {
  return `<div class="stat"><span class="stat-value ${signal ? "stat-value--signal" : ""}">${esc(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
}

export function shell(state, route, content, { immersive = false, topRight = "" } = {}) {
  const navItems = [
    { id: "home", label: "首页", href: "#/home", icon: "house" },
    { id: "connections", label: "最近", href: "#/connections", icon: "clock" },
    { id: "friends", label: "好友", href: "#/friends", icon: "users" },
    { id: "me", label: "我的", href: "#/me", icon: "user" },
  ];
  const active = route;

  const railNav = navItems
    .map(
      (n) =>
        `<a class="rail-link ${active === n.id ? "rail-link--active" : ""}" href="${n.href}" data-nav>${icon(
          n.icon,
          18
        )}<span>${n.label}</span></a>`
    )
    .join("");

  const tabNav = `
    ${navItems
      .slice(0, 1)
      .map((n) => `<a class="tabbar-item ${active === n.id ? "tabbar-item--active" : ""}" href="${n.href}">${icon(n.icon, 20)}<span>${n.label}</span></a>`)
      .join("")}
    <span class="tabbar-spacer" aria-hidden="true"></span>
    <a class="tabbar-fab" href="#/need" aria-label="开始匹配" data-nav>${icon("gamepad2", 24)}</a>
    ${navItems
      .slice(1)
      .map((n) => `<a class="tabbar-item ${active === n.id ? "tabbar-item--active" : ""}" href="${n.href}">${icon(n.icon, 20)}<span>${n.label}</span></a>`)
      .join("")}
  `;

  return `<div class="shell">
    <aside class="rail">
      ${brand(34)}
      <nav class="rail-nav" aria-label="主导航">
        ${railNav}
        <a class="rail-link" href="#/need" data-nav>${icon("gamepad2", 18)}<span>开始匹配</span></a>
      </nav>
      <div class="rail-footer">
        <div class="live-strip">
          <span class="status-pill status-pill--live"><span class="dot"></span>${state.match.status === "idle" ? "等待匹配" : "匹配中"}</span>
          <span class="live-count">${esc(Math.max(0, state.match.pool ?? 0))} 人在线找队友</span>
        </div>
        <div class="rail-user">
          ${avatarWrap(state.user.avatarKey, 34, state.user.online)}
          <div class="rail-user-meta"><div class="rail-user-name">${esc(state.user.nickname)}</div><div class="rail-user-status">${esc(state.user.device)} · 在线</div></div>
        </div>
      </div>
    </aside>
    <div class="shell-main">
      <header class="topbar">
        ${brand(30)}
        <div class="topbar-right">${topRight}</div>
      </header>
      <main id="view" class="view">${content}</main>
      <nav class="tabbar" aria-label="移动导航">${tabNav}</nav>
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
