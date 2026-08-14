import { icon } from "../icons.js";
import { button, esc, shell } from "../ui.js";

export function connectionsPage(state) {
  const history = state.history || [];
  const list =
    history.length === 0
      ? `<div class="empty-state">
          ${icon("clock", 30)}
          <strong>还没有一起玩过的人</strong>
          <span>完成一次匹配并一起打完一局，就会出现在这里。</span>
          ${button({ label: "开始匹配", action: "start-match", kind: "primary", iconName: "gamepad2" })}
        </div>`
      : `<div class="history-list">${history
          .slice(0, 30)
          .map(
            (h) => `<div class="history-row">
              <div class="history-main"><span class="history-title">${esc(h.title)}</span><span class="history-sub">${esc(h.partnerName)} · ${esc(h.time)}</span></div>
              <span class="history-result">${esc(h.result)}</span>
            </div>`
          )
          .join("")}</div>`;

  return shell(
    state,
    "connections",
    `<div class="page">
      <div class="page-head">
        <div class="page-eyebrow">${icon("clock", 13)} 最近连接</div>
        <h1 class="page-title">最近一起玩过的人</h1>
        <p class="page-sub">只记录真实一起玩过的局，方便你再次找到对方。</p>
      </div>
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">最近连接</h2>
          <span class="section-note">${history.length} 条记录</span>
        </div>
        ${list}
      </section>
    </div>`
  );
}
