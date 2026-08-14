import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, shell, statusPill } from "../ui.js";

export function gameoverPage(state) {
  const session = state.session || {};
  const partner = session.partner || {};
  const ratings = [
    { id: "happy", label: "😊 很开心" },
    { id: "meh", label: "😐 一般" },
    { id: "bad", label: "🙁 不太顺利" },
  ];

  return shell(
    state,
    "gameover",
    `<div class="gameover-page">
      <div class="gameover-panel">
        <div class="gameover-head">
          <div class="page-eyebrow">${icon("flag", 13)} 本次游戏结束 · 最近连接</div>
          <h1 class="page-title">玩完了，这次怎么样？</h1>
          <p class="page-sub">回答两个小问题就好。最近连接会保留，但不会自动变成永久好友。</p>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="profile-identity">
            ${avatarWrap(partner.avatarKey, 64, partner.online)}
            <div style="min-width:0">
              <div class="profile-name"><strong>${esc(partner.name || "玩家")}</strong></div>
              <div class="profile-handle">${esc(partner.device || "PC")} · ${esc(session.title || "刚刚一起玩过")}</div>
            </div>
            ${statusPill("DONE")}
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="section-head"><h2 class="section-title">这次游玩怎么样？</h2><span class="section-note">只用于改进匹配</span></div>
          <div class="outcome-grid">
            ${ratings
              .map(
                (r) => `<button type="button" class="outcome-btn ${session.rating === r.id ? "outcome-btn--on" : ""}" data-action="set-room-rating" data-value="${r.id}"><span>${r.label}</span></button>`
              )
              .join("")}
          </div>
        </div>

        <div class="card rematch-card">
          <div class="section-head"><h2 class="section-title">下次还愿意和 TA 一起玩吗？</h2><span class="section-note">双方各自选择，不自动加好友</span></div>
          <div class="rematch-choices">
            ${button({ label: "愿意", action: "set-room-want", value: "yes", kind: session.wantAgain === true ? "primary" : "outline", iconName: "check" })}
            ${button({ label: "暂时不用", action: "set-room-want", value: "no", kind: session.wantAgain === false ? "danger" : "outline", iconName: "x" })}
          </div>
          ${session.wantAgain === true ? `<p class="dim" style="font-size:13px">已记录。之后可以在最近连接里再次找到 TA。</p>` : ""}
        </div>

        <div class="inline-actions" style="justify-content:center">
          ${button({ label: "查看最近连接", action: "go-recent", kind: "primary", iconName: "clock" })}
          ${button({ label: "返回首页", action: "go-home", kind: "ghost", iconName: "house" })}
        </div>
      </div>
    </div>`,
    { immersive: true }
  );
}
