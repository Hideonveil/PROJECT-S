import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { esc, homeShell } from "../ui.js";

function deadlockIdentity(user) {
  const game = (user.games || []).find((item) => item.gameId === "deadlock") || {};
  return { rank: game.note || game.rank || "尚未设置段位", role: game.role || user.playStyle || "位置待选择", device: user.device || "设备待选择" };
}

export function mePage(state) {
  const user = state.user;
  const stats = state.stats || { sessions: 0, hours: 0 };
  const recentConnections = state.recentConnections || [];
  const identity = deadlockIdentity(user);
  const completedSessions = Math.max(Number(stats.sessions || 0), recentConnections.reduce((total, connection) => total + Math.max(1, Number(connection.playCount || 1)), 0));
  return homeShell(state, `<section class="player-profile-workspace">
    <header class="player-profile-head"><div><div class="match-eyebrow">MY PLAYER / 03</div><h1>我的</h1><p>这是你留在机缘里的玩家档案。</p></div><button class="player-profile-edit" type="button" data-action="open-profile-edit">${icon("pencil", 17)}<span>编辑身份</span></button></header>
    <section class="player-profile-hero"><div class="player-profile-identity"><div class="player-profile-avatar">${avatarWrap(user.avatarKey, 106, user.online)}<i aria-label="在线"></i></div><div><span>JIYUAN PLAYER</span><h2>${esc(user.nickname || "未命名玩家")}</h2><p>${esc(user.handle || user.friendCode || "PLAYER ID")}</p></div></div><div class="player-profile-status"><i></i><span>当前状态</span><b>${user.online ? "在线" : "离线"}</b></div><div class="player-profile-tape" aria-hidden="true"><div class="player-profile-tape-track"><span>PLAYER PROFILE / NEVER PLAY ALONE / PLAYER PROFILE / NEVER PLAY ALONE /</span><span>PLAYER PROFILE / NEVER PLAY ALONE / PLAYER PROFILE / NEVER PLAY ALONE /</span></div></div></section>
    <div class="player-profile-grid">
      <section class="player-profile-panel player-profile-panel--game"><header><span>ACTIVE GAME / 01</span><b>Deadlock</b></header><div class="player-game-art-slot" aria-hidden="true"><i>GAME ART / UPLOAD LATER</i></div><dl class="player-game-specs"><div><dt>当前段位</dt><dd>${esc(identity.rank)}</dd></div><div><dt>常用位置</dt><dd>${esc(identity.role)}</dd></div><div><dt>常用设备</dt><dd>${esc(identity.device)}</dd></div></dl></section>
      <section class="player-profile-panel player-profile-panel--numbers"><header><span>PLAY LOG / 02</span><b>游玩记录</b></header><div class="player-profile-numbers"><div><b>${completedSessions}</b><span>完成对局</span></div><div><b>${Number(stats.hours || 0)}<small>h</small></b><span>累计时长</span></div></div><p>每次完成的真实游玩，都会留下下一次相遇的线索。</p></section>
      <section class="player-profile-panel player-profile-panel--friends"><header><span>FRIENDS / 03</span><b>朋友列表</b></header><div class="player-soon"><div>${icon("users", 28)}</div><b>COMING SOON</b><p>好友系统正在重新设计，暂不开放添加、搜索与列表功能。</p></div></section>
      <section class="player-profile-panel player-profile-panel--recent"><header><span>RECENTLY PLAYED / 04</span><b>最近一起玩过</b></header><div class="player-recent-list">${recentConnections.length ? recentConnections.slice(0, 5).map((connection) => `<article><div>${avatarWrap(connection.avatarKey, 38, connection.online)}</div><span><b>${esc(connection.name || "玩家")}</b><small>${esc(connection.gameName || "Deadlock")} · 一起玩过 ${Number(connection.playCount || 1)} 次</small></span><i>${connection.playedAt ? new Date(connection.playedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "最近"}</i></article>`).join("") : `<div class="player-recent-empty">${icon("clock", 24)}<b>还没有游玩记录</b><span>完成第一局后，最近一起玩过的人会出现在这里。</span></div>`}</div></section>
    </div><button class="player-profile-logout" type="button" data-action="logout">登出账号 ${icon("logOut", 16)}</button>
  </section>`, "me");
}
