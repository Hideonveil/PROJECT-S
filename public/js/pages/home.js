import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { GAMES, HOME_CASUAL_TIMES, HOME_COMPETITIVE_GAME_IDS, HOME_GAME_IDS, HOME_RANK_TIMES } from "../data.js";

const HOME_META = {
  minecraft: { en: "MINECRAFT", tag: "沙盒" },
  stardew: { en: "STARDEW VALLEY", tag: "模拟" },
  pubg: { en: "BATTLE ROYALE", tag: "射击" },
  deadlock: { en: "VALVE", tag: "MOBA FPS" },
};

function homeGameRows() {
  return HOME_GAME_IDS.map((id, i) => {
    const game = GAMES.find((g) => g.id === id);
    if (!game) return "";
    const meta = HOME_META[id] || {};
    const competitive = HOME_COMPETITIVE_GAME_IDS.includes(id);
    return `<div class="home-filter-game-row ${i === 0 ? "is-on" : ""}" data-home-game="${esc(id)}" data-competitive="${competitive ? "true" : "false"}" data-action="home-game" data-value="${esc(id)}">
      <span class="home-filter-game-check"></span>
      <div class="home-filter-game-name">${esc(game.name)}<small>${esc(meta.en || "")}</small></div>
      <div class="home-filter-game-swell"></div>
      <div class="home-filter-game-ph"><i></i></div>
    </div>`;
  }).join("");
}

function homeTag(value, label, on, action) {
  return `<button type="button" class="home-filter-tag ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`;
}

export function homePage(state) {
  const firstGame = GAMES.find((g) => g.id === HOME_GAME_IDS[0]) || GAMES[0];
  const modeChips = (firstGame.modes || []).map((m, i) => homeTag(m, m, i === 0, "home-mode")).join("");
  const timeChips = HOME_CASUAL_TIMES.map((t, i) => homeTag(t, t, i === 0, "home-time")).join("");
  const teamChips = ["1", "2", "3", "4"].map((n, i) => homeTag(n, `${n}人${n === "4" ? "+" : ""}`, i === 0, "home-team")).join("");
  const voiceChips = ["需要", "不需要", "都可以"].map((v) => homeTag(v, v, v === "需要", "home-voice")).join("");

  return homeShell(
    state,
    `<div class="home-stage">
      <div class="home-diamond-wrap">
        <button type="button" class="home-diamond" data-action="toggle-home-filter" aria-expanded="false" aria-label="匹配">
          <span>匹配</span>
        </button>
      </div>
    </div>

    <div class="home-filter-overlay" data-home-filter hidden>
        <div class="home-filter-scrim" data-action="close-home-filter"></div>
        <div class="home-filter-dialog-shell">
          <div class="home-filter-dialog">
            <button type="button" class="home-filter-close" data-action="close-home-filter" aria-label="关闭">${icon("x", 18)}</button>
            <div class="home-filter-progress">
              <div class="home-filter-step is-on" data-home-step="game"><span class="home-filter-node"><i></i></span><span class="home-filter-label">游戏</span></div>
              <div class="home-filter-connector"></div>
              <div class="home-filter-step" data-home-step="mode"><span class="home-filter-node"><i></i></span><span class="home-filter-label">玩法</span></div>
              <div class="home-filter-connector"></div>
              <div class="home-filter-step" data-home-step="team"><span class="home-filter-node"><i></i></span><span class="home-filter-label">人数</span></div>
              <div class="home-filter-connector"></div>
              <div class="home-filter-step" data-home-step="time"><span class="home-filter-node"><i></i></span><span class="home-filter-label" id="home-filter-time-label">时间</span></div>
              <div class="home-filter-connector home-filter-connector--dash"></div>
              <div class="home-filter-step home-filter-step--voice" data-home-step="voice" data-action="home-filter-open-voice"><span class="home-filter-node"><span class="home-filter-plus">+</span></span><span class="home-filter-label">语音</span></div>
              <div class="home-filter-connector"></div>
              <div class="home-filter-step" data-home-step="confirm"><span class="home-filter-node"><i></i></span><span class="home-filter-label">确认</span></div>
            </div>

            <div class="home-filter-panel is-show" data-home-panel="game">
              <div class="home-filter-eyebrow"><i></i>STEP 01 · GAME</div>
              <div class="home-filter-panel-title">你想玩什么？</div>
              <div class="home-filter-panel-sub">选择一款游戏，进入对应的匹配设定。</div>
              <div class="home-filter-game-list">${homeGameRows()}</div>
              <div class="home-filter-expand"><span class="home-filter-expand-diamond"><span>+</span></span>展开更多游戏</div>
              <div class="home-filter-contact">联系我们增添新游戏</div>
            </div>

            <div class="home-filter-panel" data-home-panel="mode">
              <div class="home-filter-eyebrow"><i></i>STEP 02 · MODE</div>
              <div class="home-filter-panel-title">这次想怎么玩？</div>
              <div class="home-filter-panel-sub">选择一个玩法，系统会按它寻找同类玩家。</div>
              <div class="home-filter-tag-group" id="home-filter-mode-tags">${modeChips}</div>
            </div>

            <div class="home-filter-panel" data-home-panel="team">
              <div class="home-filter-eyebrow"><i></i>STEP 03 · TEAM</div>
              <div class="home-filter-panel-title">现在有几个人？</div>
              <div class="home-filter-panel-sub">你这边已有的人数，以及还需要几个队友。</div>
              <div class="home-filter-tag-group">${teamChips}</div>
            </div>

            <div class="home-filter-panel" data-home-panel="time">
              <div class="home-filter-eyebrow"><i></i>STEP 04 · SCHEDULE</div>
              <div class="home-filter-panel-title" id="home-filter-time-title">什么时候玩？</div>
              <div class="home-filter-panel-sub" id="home-filter-time-sub">确定本次匹配的启动时间。</div>
              <div class="home-filter-tag-group" id="home-filter-time-tags">${timeChips}</div>
            </div>

            <div class="home-filter-panel" data-home-panel="voice">
              <div class="home-filter-eyebrow"><i></i>STEP 05 · VOICE</div>
              <div class="home-filter-panel-title">需要语音吗？</div>
              <div class="home-filter-panel-sub">语音需求会作为匹配参考。</div>
              <div class="home-filter-tag-group">${voiceChips}</div>
            </div>

            <div class="home-filter-panel" data-home-panel="confirm">
              <div class="home-filter-eyebrow"><i></i>STEP 06 · CONFIRM</div>
              <div class="home-filter-panel-title">确认本次需求</div>
              <div class="home-filter-panel-sub">最后看一眼，点开始匹配就进入实时匹配池。</div>
              <div class="home-filter-confirm-summary" id="home-filter-confirm-summary"></div>
            </div>

            <div class="home-filter-actions">
              <button type="button" class="home-filter-back is-disabled" data-action="home-filter-back" disabled>返回</button>
              <span class="home-filter-hint" id="home-filter-hint">1 / 6</span>
              <button type="button" class="home-filter-next" data-action="home-filter-next">下一步${icon("arrowRight", 16)}</button>
            </div>
          </div>
        </div>
      </div>`
  );
}
