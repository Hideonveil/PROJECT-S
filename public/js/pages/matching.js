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
  const pair = state.match.pair;
  const candidate = state.match.candidate;
  const awaiting = pair?.state === "waiting_confirmation" && candidate;
  const mine = pair?.confirmations?.find((confirmation) => confirmation.user_id === state.user.id)?.decision;
  const theirs = pair?.confirmations?.find((confirmation) => confirmation.user_id !== state.user.id)?.decision;
  const confirmationCopy = mine === "accepted" && theirs === "accepted"
    ? "双方都已确定，正在建立房间。"
    : mine === "accepted"
      ? "你已准备，正在等对方确定。"
      : theirs === "accepted"
        ? "对方已确定，正在等你。"
        : "你们可以分别确定，不需要同时点击。";
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
          <span class="matching-player-card matching-player-card--right" id="matching-candidate-mark">${awaiting ? esc((candidate.nickname || "玩家").slice(0, 1)) : "?"}</span>
        </div>
        <div class="matching-modal-copy">
          <div class="match-eyebrow">FINDING YOUR PEOPLE / 01</div>
          <h1 id="matching-modal-title">${awaiting ? `找到 ${esc(candidate.nickname || "一位玩家")}。` : "正在找同一局的人。"}</h1>
          <p id="match-desc">${awaiting ? confirmationCopy : "先检查官方硬规则，再比较位置与麦克风偏好。"}</p>
        </div>
        <div class="matching-query" aria-label="本次匹配条件">${queryPills(state.need)}</div>
        <div class="matching-ready-state" id="matching-ready-state" aria-live="polite" ${awaiting ? "" : "hidden"}>
          <span id="matching-ready-me" class="${mine === "accepted" ? "is-ready" : ""}">${mine === "accepted" ? icon("check", 15) : icon("clock", 15)}你：${mine === "accepted" ? "已确定" : "待确定"}</span>
          <span id="matching-ready-them" class="${theirs === "accepted" ? "is-ready" : ""}">${theirs === "accepted" ? icon("check", 15) : icon("clock", 15)}对方：${theirs === "accepted" ? "已确定" : "待确定"}</span>
        </div>
      </div>

      <div class="matching-modal-progress">
        <div class="matching-modal-stats">
          <span><b id="pool-count">${pool}</b><small>匹配池人数</small></span>
          <span><b id="match-time">0s</b><small>等待时长</small></span>
          <span><b id="match-found">${awaiting ? 1 : 0}</b><small>锁定候选</small></span>
        </div>
        <div class="matching-modal-steps" aria-label="匹配进度">
          <div class="matching-modal-step is-done" data-step="0"><i></i><span>需求已读取</span></div>
          <div class="matching-modal-step is-active" data-step="1"><i></i><span id="match-title">正在扫描匹配池</span></div>
          <div class="matching-modal-step" data-step="2"><i></i><span>锁定合适玩家</span></div>
        </div>
      </div>

      <footer class="matching-modal-footer">
        <p id="matching-footer-status"><i></i>${awaiting ? "候选已暂时锁定，确认超时会自动回到匹配池。" : "匹配期间保持在线，我们会持续更新状态。"}</p>
        <div class="matching-confirm-actions" id="matching-confirm-actions">
          ${awaiting && mine !== "accepted" ? `<button type="button" data-action="reject-match"><span>不是这位</span>${icon("x", 16)}</button><button type="button" data-action="confirm-match"><span>确定是 TA</span>${icon("check", 16)}</button>` : ""}
          <button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>
        </div>
      </footer>
    </section>
  </div>`, "home");
}
