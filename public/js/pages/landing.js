import { icon } from "../icons.js";
import { brandMark, esc } from "../ui.js";
import { gameById, gameName } from "../game-catalog.js";
import { rankLabel } from "../ranks.js?v=20260821-rank-label-01";

function accountActions(state) {
  if (!state.authenticated) {
    return `<div class="landing-auth"><button type="button" data-action="open-auth-login">登录</button><button class="landing-register" type="button" data-action="open-auth-register">注册</button></div>`;
  }
  return `<div class="landing-auth landing-auth--signed"><button type="button" data-action="go-me"><span>${esc(state.user.nickname)}</span><small>${esc(state.user.handle || state.user.friendCode || state.user.id || "PLAYER")}</small></button><button type="button" data-action="logout">登出</button></div>`;
}

function maskNickname(value) {
  const text = String(value || "玩家").trim() || "玩家";
  if (text.includes("*")) return text;
  const chars = Array.from(text);
  if (chars.length === 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(Math.min(3, chars.length - 2))}${chars.at(-1)}`;
}

function compactRank(rankCode, gameId) {
  return rankLabel(rankCode, "", gameId).split("（")[0].trim();
}

function compactRoles(roles, gameId) {
  const positions = gameById(gameId)?.positionOptions || [];
  const labels = (Array.isArray(roles) ? roles : []).map((role) => positions.find((position) => Number(position.code) === Number(role))?.roleLabel || "").filter(Boolean).slice(0, 2);
  return labels.length ? labels.join(" / ") : "不限位置";
}

function compactConfig(person) {
  const mode = person?.mode === "casual" ? "休闲" : "冲分";
  const rank = person?.mode === "casual" ? "" : compactRank(person?.rankCode, person?.gameId);
  const roles = compactRoles(person?.desiredRoles, person?.gameId);
  const mic = person?.microphonePreference === "off" ? "不开麦" : person?.microphonePreference === "on" ? "开麦" : "麦克风无所谓";
  return [mode, rank, roles, mic].filter(Boolean).join(" · ");
}

export function heroDirectoryPersonMarkup(person, extraClass = "") {
  const nickname = maskNickname(person.nickname);
  return `<article class="hero-directory-person ${extraClass}" data-hero-directory-person aria-label="正在匹配的玩家 ${esc(nickname)}"><div class="hero-directory-person-main"><span class="hero-directory-avatar" aria-hidden="true">${icon("user", 15)}</span><b>${esc(nickname)}</b></div><div class="hero-directory-person-meta"><span>${esc(gameName(person.gameId, person.gameId || "游戏"))}</span><i>${esc(compactConfig(person))}</i></div></article>`;
}

export function heroDirectoryMarkup(directory = []) {
  const people = Array.isArray(directory) ? directory.slice(0, 3) : [];
  if (!people.length) return `<div class="hero-directory-empty"><span class="hero-directory-pulse"></span><b>正在等下一位玩家</b><small>进入匹配后，你会出现在这里</small></div>`;
  return people.map((person) => heroDirectoryPersonMarkup(person)).join("");
}

export function landingPage(state) {
  const warningText = "总有人想一起玩　/　NEVER PLAY ALONE　/　".repeat(8);

  return `<div class="landing-shell"><canvas class="landing-waves" data-hero-waves aria-hidden="true"></canvas><div class="landing-grain" aria-hidden="true"></div>
    <header class="landing-header"><a class="landing-brand" href="#/hero" aria-label="“机”缘首页">${brandMark(44)}<strong>“机”缘</strong></a>${accountActions(state)}</header>
    <main class="landing-main landing-reactive-main">
      <section class="landing-hero landing-reactive-hero" aria-labelledby="landing-title">
        <div class="hero-center-copy">
          <h1 id="landing-title"><span>总有人想</span><strong>一起玩。</strong></h1>
          <div class="hero-slogan">NEVER PLAY ALONE</div>
          <div class="hero-actions"><button class="hero-launch" type="button" data-action="enter-match"><span>开始匹配</span>${icon("arrowRight", 23)}</button></div>
        </div>
        <div class="hero-right-rail">
          <section class="hero-directory-shell hero-directory-shell--activity" aria-label="此刻的“机”缘"><div class="hero-directory-head"><span>此刻的“机”缘</span><small>实时更新</small></div><div class="hero-directory" id="hero-directory">${heroDirectoryMarkup(state.match?.directory)}</div></section>
        </div>
      </section>
      <section class="landing-more" id="landing-more" aria-label="关于“机”缘"><div class="landing-statement"><span>不是随机遇见。</span><strong>是此刻刚好都想玩。</strong></div><div class="landing-lower-grid"><button class="landing-contact" type="button" data-action="open-feedback"><span>联系我们</span><small>建议、合作或一起完善“机”缘</small>${icon("arrowRight", 24)}</button><div class="landing-reserved" aria-label="后续内容预留"><span>“机”缘 / NEXT</span><i></i><i></i></div></div></section>
    </main>
    <div class="product-ticker landing-ticker" data-product-ticker aria-label="总有人想一起玩"><div class="product-ticker-track" data-ticker-track aria-hidden="true"><span class="product-ticker-text" data-ticker-head>${warningText}</span><span class="product-ticker-text" data-ticker-tail>${warningText}</span></div></div>
    <section class="pc-only-gate" role="dialog" aria-modal="true" aria-labelledby="pc-only-title"><div class="pc-only-card"><div class="pc-only-mark">${brandMark(58)}</div><div class="match-eyebrow">PC EXPERIENCE / “机”缘</div><h1 id="pc-only-title">请使用电脑打开</h1><p>“机”缘当前只开放 PC 版。用电脑浏览器进入，才能完整使用摇人、匹配与 Session 房间。</p><div class="pc-only-device">${icon("monitor", 30)}<span><b>推荐设备</b><small>Windows / macOS · Chrome / Edge</small></span></div></div><div class="pc-only-warning"><span>总有人想一起玩</span><i>/</i><b>NEVER PLAY ALONE</b><i>/</i></div></section>
  </div>`;
}

export const HERO_PREVIEW_DIRECTORY = [
  { nickname: "暮色玩家", gameId: "deadlock", mode: "ranked", rankCode: "铂金", desiredRoles: [1], microphonePreference: "on" },
  { nickname: "河岸边", gameId: "deadlock", mode: "casual", desiredRoles: [3], microphonePreference: "any" },
  { nickname: "晚风", gameId: "deadlock", mode: "ranked", rankCode: "黄金", desiredRoles: [5], microphonePreference: "off" },
  { nickname: "白昼线", gameId: "deadlock", mode: "casual", desiredRoles: [2], microphonePreference: "on" },
  { nickname: "北纬三十", gameId: "deadlock", mode: "ranked", rankCode: "钻石", desiredRoles: [4], microphonePreference: "any" },
];

export function heroPreviewPage() {
  return landingPage({
    authenticated: false,
    user: { nickname: "预览玩家" },
    match: {
      directory: HERO_PREVIEW_DIRECTORY,
    },
  });
}
