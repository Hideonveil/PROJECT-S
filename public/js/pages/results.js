import { icon } from "../icons.js";
import { button, esc, needSummary, playerCard, shell, statusPill } from "../ui.js";

export function resultsPage(state) {
  const candidates = state.match.candidates || [];
  const pending = state.match.pending;
  return shell(
    state,
    "home",
    `<div class="page">
      <div class="results-head">
        <div class="page-eyebrow">${icon("link2", 13)} 匹配完成 · 你来决定</div>
        <h1 class="page-title">找到 ${candidates.length} 个合适节点</h1>
        <p class="page-sub">算法只负责筛选，选择和谁一起玩由你决定。先看主页里的游戏身份，再决定是否邀请。</p>
        <div class="inline-actions">
          ${statusPill("LIVE")}
          <span class="candidate-count">${esc(Math.max(0, state.match.pool ?? 0))} 人仍在匹配池</span>
          ${button({ label: "重新匹配", action: "rematch", kind: "outline", size: "sm", iconName: "refreshCw" })}
        </div>
      </div>
      ${
        pending
          ? `<div class="card" style="border-color:var(--signal-border);background:var(--signal-soft);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div class="inline-actions">${statusPill("CONNECTED")}<span style="color:var(--paper);font-weight:700">邀请已发送，等对方也邀请你</span></div>
              ${button({ label: "进入临时房间", action: "open-room", kind: "primary", iconName: "arrowRight" })}
            </div>`
          : ""
      }
      <div class="results-list">${candidates.map((c) => playerCard(c, { pending: pending === c.id })).join("")}</div>
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">当前需求</h2>
          <span class="section-note">算法依据</span>
        </div>
        <div class="grid-2">
          ${needSummary(state.need)}
          <div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="card-title">为什么按需求匹配</div>
            <p class="dim" style="font-size:13px">project S beta 不比较两个人的长期资料有多像，而是比较此刻的需求是否在同一局里互补：目标、人数、时间窗口、职责、语音。</p>
            <div class="reason-tags" style="display:flex;flex-wrap:wrap;gap:8px">
              <span class="reason-tag reason-tag--neutral">同游戏</span>
              <span class="reason-tag reason-tag--neutral">同目标</span>
              <span class="reason-tag reason-tag--neutral">人数互补</span>
              <span class="reason-tag reason-tag--neutral">时间重叠</span>
              <span class="reason-tag reason-tag--neutral">职责互补</span>
            </div>
          </div>
        </div>
      </section>
    </div>`
  );
}
