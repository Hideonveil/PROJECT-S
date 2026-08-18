import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { esc, homeShell } from "../ui.js";

export function mePage(state) {
  const user = state.user;
  const stats = state.stats || { sessions: 0, connected: 0, hours: 0 };
  const friends = state.friends || [];
  const recentConnections = state.recentConnections || [];
  const history = recentConnections.map((connection) => ({
        partnerName: connection.name || "玩家",
        title: `${connection.gameName || "一起玩过"} · ${connection.playCount || 1} 次`,
        time: connection.playedAt
          ? new Date(connection.playedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
          : "最近",
      }));
  const completedSessions = Math.max(
    Number(stats.sessions || 0),
    recentConnections.reduce((total, connection) => total + Math.max(1, Number(connection.playCount || 1)), 0)
  );
  const connectedPlayers = Math.max(Number(stats.connected || 0), friends.length);
  const friendCode = user.friendCode || "NODE-XXXX-XXXX";

  return homeShell(
    state,
    `<section class="product-me-workspace">
      <header class="product-me-head">
        <div><div class="match-eyebrow">03 / MY PLAYER</div><h1>我的</h1><p>身份、朋友和最近一起玩过的人，都留在这里。</p></div>
        <button class="product-line-button" type="button" data-action="open-profile-edit">${icon("pencil", 18)}<span>编辑身份</span></button>
      </header>

      <div class="product-me-grid">
        <article class="product-me-card product-me-card--identity">
          <div class="product-me-card-label">PLAYER IDENTITY</div>
          <div class="product-me-identity">${avatarWrap(user.avatarKey, 82, user.online)}<div><h2>${esc(user.nickname)}</h2><p>${esc(user.handle)}</p><span>${esc(user.device)} · ${user.voice ? "语音开黑" : "文字交流"}</span></div></div>
          <div class="product-me-stats"><div><b>${completedSessions}</b><span>完成局数</span></div><div><b>${connectedPlayers}</b><span>保留连接</span></div><div><b>${stats.hours}h</b><span>累计时长</span></div></div>
          <div class="product-code"><span>好友代码</span><b>${esc(friendCode)}</b><button type="button" data-action="copy-code" data-value="${esc(friendCode)}">${icon("copy", 16)}复制</button></div>
        </article>

        <article class="product-me-card">
          <div class="product-me-card-head"><div><div class="product-me-card-label">FRIENDS</div><h2>朋友</h2></div><a href="#/friends" data-nav>查看全部 ${icon("arrowRight", 16)}</a></div>
          <div class="product-person-list">
            ${friends.length ? friends.slice(0, 3).map((friend) => `<div class="product-person">${avatarWrap(friend.avatarKey, 42, friend.online)}<div><b>${esc(friend.name)}</b><span>${esc(friend.lastGame || "等待下一局")}</span></div><i>${friend.online ? "在线" : "离线"}</i></div>`).join("") : `<div class="product-empty">${icon("users", 25)}<b>还没有朋友</b><span>完成一次真实匹配后，可以把对方留下来。</span></div>`}
          </div>
        </article>

        <article class="product-me-card">
          <div class="product-me-card-head"><div><div class="product-me-card-label">RECENT CONNECTIONS</div><h2>最近匹配的人</h2></div><a href="#/connections" data-nav>全部记录 ${icon("arrowRight", 16)}</a></div>
          <div class="product-history-list">
            ${history.length ? history.slice(0, 4).map((item) => `<div><span>${esc(item.partnerName || "玩家")}</span><b>${esc(item.title || "一起玩过")}</b><i>${esc(item.time || "最近")}</i></div>`).join("") : `<div class="product-empty">${icon("clock", 25)}<b>还没有匹配记录</b><span>第一局结束后，最近一起玩过的人会出现在这里。</span></div>`}
          </div>
        </article>
      </div>

      <button class="product-logout" type="button" data-action="logout">退出登录 ${icon("logOut", 17)}</button>
    </section>`,
    "me"
  );
}
