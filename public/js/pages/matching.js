import { GAME_BY_ID } from "../data.js";
import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";

function queryPills(need) {
  const game = GAME_BY_ID[need.game]?.name || need.game || "Deadlock";
  const details = need.details || {};
  const values = [
    ["gamepad2", game],
    ["target", need.goal || need.mode || "匹配"],
    [need.voice ? "mic" : "volumeX", need.voice ? "开麦" : "不开麦"],
    ["clock", need.time || "现在"],
  ];
  if (details.role) values.splice(2, 0, ["circleDot", details.role]);
  return values.map(([iconName, label]) => `<span>${icon(iconName, 15)}${esc(label)}</span>`).join("");
}

export function matchingPage(state) {
  const pool = Math.max(0, state.match.pool ?? 0);
  return homeShell(state, `<div class="matching-modal-page" role="dialog" aria-modal="true" aria-labelledby="matching-modal-title">
    <div class="matching-modal-backdrop" aria-hidden="true"></div>
    <section class="matching-modal" data-matching-modal>
      <header class="matching-modal-head">
        <div><span class="matching-modal-live"><i></i>MATCHING / LIVE</span><p>PROJECT-S 正在读取当前匹配池</p></div>
        <button type="button" class="matching-modal-close" data-action="cancel-match" aria-label="退出匹配">${icon("x", 20)}</button>
      </header>

      <div class="matching-modal-content">
        <div class="matching-signal" aria-hidden="true">
          <span class="matching-signal-ring matching-signal-ring--one"></span>
          <span class="matching-signal-ring matching-signal-ring--two"></span>
          <span class="matching-signal-ring matching-signal-ring--three"></span>
          <span class="matching-player-card matching-player-card--left">01</span>
          <span class="matching-player-card matching-player-card--center">${icon("gamepad2", 38)}</span>
          <span class="matching-player-card matching-player-card--right">?</span>
        </div>
        <div class="matching-modal-copy">
          <div class="match-eyebrow">FINDING YOUR PEOPLE / 01</div>
          <h1 id="matching-modal-title">正在找同一局的人。</h1>
          <p id="match-desc">先对齐游戏、目的和时间，再把真正适合的玩家带到你面前。</p>
        </div>
        <div class="matching-query" aria-label="本次匹配条件">${queryPills(state.need)}</div>
      </div>

      <div class="matching-modal-progress">
        <div class="matching-modal-stats">
          <span><b id="pool-count">${pool}</b><small>匹配池人数</small></span>
          <span><b id="match-time">0s</b><small>等待时长</small></span>
          <span><b id="match-found">0</b><small>锁定候选</small></span>
        </div>
        <div class="matching-modal-steps" aria-label="匹配进度">
          <div class="matching-modal-step is-done" data-step="0"><i></i><span>需求已读取</span></div>
          <div class="matching-modal-step is-active" data-step="1"><i></i><span id="match-title">正在扫描匹配池</span></div>
          <div class="matching-modal-step" data-step="2"><i></i><span>锁定合适玩家</span></div>
        </div>
      </div>

      <footer class="matching-modal-footer">
        <p><i></i>匹配期间可以留在这里，我们会持续更新状态。</p>
        <button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>
      </footer>
    </section>
  </div>`, "home");
}
