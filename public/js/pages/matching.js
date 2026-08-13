import { button, needSummary, shell, statusPill } from "../ui.js";

export function matchingPage(state) {
  const pool = Math.max(0, state.match.pool ?? 0);
  return shell(
    state,
    "matching",
    `<div class="matching-page">
      <div class="node-field-wrap"><canvas data-node-field></canvas></div>
      <div class="matching-panel">
        <div class="matching-ring">${statusPill("MATCHING")}</div>
        <div class="matching-status">
          <h2 id="match-title">正在筛选节点</h2>
          <p id="match-desc">按你的需求读取此刻匹配池：同游戏、同目标、同时间窗口。</p>
        </div>
        ${needSummary(state.need, { compact: true })}
        <div class="matching-stats">
          <div class="card"><div class="stat-value stat-value--signal" id="pool-count">${pool}</div><div class="stat-label">匹配池人数</div></div>
          <div class="card"><div class="stat-value" id="match-time">0s</div><div class="stat-label">等待时长</div></div>
          <div class="card"><div class="stat-value" id="match-found">0</div><div class="stat-label">已锁定节点</div></div>
        </div>
        <div class="matching-steps">
          <div class="match-step match-step--done" data-step="0"><span class="step-dot"></span>已读取当前需求</div>
          <div class="match-step match-step--active" data-step="1"><span class="step-dot"></span>正在匹配同游戏、同目标、同时间窗口的节点</div>
          <div class="match-step" data-step="2"><span class="step-dot"></span>为你筛选最适合的 2–3 个候选</div>
        </div>
        <div style="display:flex;justify-content:center">
          ${button({ label: "取消匹配", action: "cancel-match", kind: "danger", size: "sm", iconName: "x" })}
        </div>
      </div>
    </div>`,
    { immersive: true, topRight: button({ label: "取消", action: "cancel-match", kind: "ghost", size: "sm", iconName: "x" }) }
  );
}
