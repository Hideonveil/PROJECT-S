import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { GAMES } from "../data.js";

function chip(value, label, on, action) {
  return `<button type="button" class="chip ${on ? "chip--on" : ""}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`;
}

export function homePage(state) {
  const firstGame = GAMES[0];
  const gameChips = GAMES.map((g, i) => chip(g.id, g.name, i === 0, "home-game")).join("");
  const modeChips = (firstGame.modes || []).map((m, i) => chip(m, m, i === 0, "home-mode")).join("");
  const timeChips = ["现在就玩", "30分钟后", "晚些时候"].map((t, i) => chip(t, t, i === 0, "home-time")).join("");
  const teamChips = ["1", "2", "3", "4"].map((n, i) => chip(n, `${n}人${n === "4" ? "+" : ""}`, i === 0, "home-team")).join("");
  const voiceChips = ["需要", "不需要", "都可以"].map((v, i) => chip(v, v, i === 0, "home-voice")).join("");

  return homeShell(
    state,
    `<div class="home-stage">
      <div class="home-diamond-wrap">
        <button type="button" class="home-diamond" data-action="toggle-home-filter" aria-expanded="false" aria-label="匹配">
          <span>匹配</span>
        </button>
      </div>
      <section class="home-filter" id="home-filter" hidden>
        <div class="home-filter-head">
          <span class="home-filter-title">匹配筛选</span>
          <button type="button" class="home-filter-close" data-action="toggle-home-filter" aria-label="收起">${icon("x", 16)}</button>
        </div>
        <div class="home-filter-grid">
          <div class="home-filter-field">
            <span class="home-filter-label">游戏</span>
            <div class="chip-group" data-home-group="game">${gameChips}</div>
          </div>
          <div class="home-filter-field">
            <span class="home-filter-label">玩法</span>
            <div class="chip-group" data-home-group="mode" data-home-mode-wrap>${modeChips}</div>
          </div>
          <div class="home-filter-field">
            <span class="home-filter-label">时间</span>
            <div class="chip-group" data-home-group="time">${timeChips}</div>
          </div>
          <div class="home-filter-field">
            <span class="home-filter-label">人数</span>
            <div class="chip-group" data-home-group="team">${teamChips}</div>
          </div>
          <div class="home-filter-field">
            <span class="home-filter-label">语音</span>
            <div class="chip-group" data-home-group="voice">${voiceChips}</div>
          </div>
        </div>
        <div class="home-filter-actions">
          <button type="button" class="btn btn--ghost" data-action="home-filter-reset">重置</button>
          <button type="button" class="btn btn--primary" data-action="home-filter-start">开始寻找</button>
        </div>
      </section>
    </div>`
  );
}
