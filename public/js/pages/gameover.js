import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell } from "../ui.js";

function friendshipControl() {
  return `<span class="connection-friend-paused">${icon("users", 16)}好友系统 COMING SOON</span>`;
}

export function gameoverPage(state) {
  const session = state.session || {};
  const partner = session.partner || {};
  const ratings = [
    { id: "happy", label: "很开心", note: "交流顺畅，真的玩到一起" },
    { id: "meh", label: "一般", note: "完成了游戏，但体验普通" },
    { id: "bad", label: "不太顺利", note: "交流或游玩过程有问题" },
  ];

  return homeShell(
    state,
    `<main class="connection-gameover" data-gameover-root>
      <header class="connection-gameover__header">
        <span class="connection-room__eyebrow"><i></i>CONNECTION CLOSED / FEEDBACK</span>
        <p>本次连接已归档</p>
        <h1>玩完了，这次怎么样？</h1>
        <span>留下最简单的反馈，帮助下一次更合适。</span>
      </header>

      <div class="connection-tape" aria-hidden="true"><span>SESSION COMPLETE / NEVER PLAY ALONE / SESSION COMPLETE / NEVER PLAY ALONE /</span></div>

      <section class="connection-gameover__partner">
        <span class="connection-player__index">PLAYER 02 / LAST CONNECTION</span>
        <div class="connection-gameover__identity">
          ${avatarWrap(partner.avatarKey, 84, partner.online)}
          <div><h2>${esc(partner.name || partner.nickname || "对方玩家")}</h2><p>${esc(partner.device || "PC")} · ${esc(session.title || "刚刚一起玩过")}</p></div>
        </div>
        <button type="button" class="connection-like ${session.liked ? "is-liked" : ""}" data-action="set-room-like" data-value="${session.liked ? "no" : "yes"}" data-gameover-like aria-pressed="${Boolean(session.liked)}">
          ${icon("heart", 22)}<span>${session.liked ? "已点赞" : "为 TA 点赞"}</span>
        </button>
        <div class="connection-gameover__friend" data-gameover-friendship>${friendshipControl()}</div>
      </section>

      <section class="connection-gameover__experience">
        <div class="connection-section-title"><span>01</span><div><h2>这次游玩体验</h2><p>只用于改进匹配，不公开展示。</p></div></div>
        <div class="connection-rating-grid" data-gameover-ratings>
          ${ratings.map((rating, index) => `<button type="button" class="connection-rating ${session.rating === rating.id ? "is-selected" : ""}" data-action="set-room-rating" data-value="${rating.id}" aria-pressed="${session.rating === rating.id}"><b>0${index + 1}</b><span>${rating.label}</span><small>${rating.note}</small></button>`).join("")}
        </div>
      </section>

      <footer class="connection-gameover__footer">
        <p>最近连接会保留，你随时可以回来找到这位玩家。</p>
        <div>${button({ label: "查看最近连接", action: "go-recent", kind: "primary", iconName: "clock" })}${button({ label: "返回首页", action: "go-home", kind: "ghost", iconName: "house" })}</div>
      </footer>
    </main>`,
    "home"
  );
}
