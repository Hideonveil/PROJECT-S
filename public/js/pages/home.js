import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { GAMES, HOME_CASUAL_TIMES, HOME_GAME_IDS } from "../data.js";

const GAME_ICONS = { hok: "trophy", valorant: "target", deadlock: "swords", minecraft: "gamepad2" };

function gameOptions(selected) {
  return HOME_GAME_IDS.map((id) => {
    const game = GAMES.find((item) => item.id === id);
    if (!game) return "";
    const on = id === selected;
    return `<button type="button" class="cursor-target match-option match-game-option home-filter-game-row ${on ? "is-on" : ""}" data-home-game="${esc(id)}" data-action="home-game" data-value="${esc(id)}" aria-pressed="${on}">
      <span class="match-option-icon">${icon(GAME_ICONS[id] || "gamepad2", 21)}</span><span>${esc(game.name)}</span><span class="match-option-check">${icon("check", 12)}</span>
    </button>`;
  }).join("");
}

function option(value, label, on, action, iconName = "") {
  return `<button type="button" class="cursor-target home-filter-tag match-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${on}">
    ${iconName ? `<span class="match-option-icon">${icon(iconName, 20)}</span>` : ""}<span>${esc(label)}</span><span class="match-option-check">${icon("check", 12)}</span>
  </button>`;
}

export function homePage(state, filter) {
  const selectedGame = GAMES.find((game) => game.id === filter.game) || GAMES.find((game) => game.id === HOME_GAME_IDS[0]) || GAMES[0];
  const modes = (selectedGame.modes || []).slice(0, 3).map((mode, index) => option(mode, mode.replace(" / ", ""), mode === filter.mode || (!filter.mode && index === 0), "home-mode", index === 0 ? "trophy" : index === 1 ? "swords" : "circleDot")).join("");
  const times = HOME_CASUAL_TIMES.map((time, index) => option(time, time === "现在就玩" ? "尽快开始" : time, time === filter.time, "home-time", index === 0 ? "clock" : index === 4 ? "calendar" : "timer")).join("");
  const voices = [["需要", "语音开黑", "mic"], ["不需要", "文字交流", "messageSquare"], ["都可以", "无偏好", "volumeX"]].map(([value, label, iconName]) => option(value, label, value === filter.voice, "home-voice", iconName)).join("");
  const pool = Math.max(0, Number(state.match.pool || 0));

  return homeShell(state, `<div class="match-workspace">
    <header class="match-head">
      <div><div class="match-eyebrow">01 / MATCH</div><h1>摇人</h1><p>总有人想一起玩</p></div>
      <div class="match-live" aria-label="匹配池状态"><span></span><b>匹配池在线</b><i>·</i><em>${pool ? `${pool} 人正在找队友` : "等待新的玩家"}</em></div>
    </header>
    <div class="match-form" aria-label="匹配筛选">
      <section class="match-block"><h2><span>01</span>选择游戏</h2><div class="match-options match-options--games" role="group" aria-label="选择游戏">${gameOptions(selectedGame.id)}</div></section>
      <section class="match-block"><h2><span>02</span>选择模式</h2><div class="home-filter-tag-group match-options" id="home-filter-mode-tags" role="group" aria-label="选择模式">${modes}</div></section>
      <section class="match-block"><h2><span>03</span>预计开始时间</h2><div class="home-filter-tag-group match-options match-options--time" id="home-filter-time-tags" role="group" aria-label="开始时间">${times}</div></section>
      <section class="match-block"><h2><span>04</span>语音偏好</h2><div class="home-filter-tag-group match-options" role="group" aria-label="语音偏好">${voices}</div></section>
    </div>
    <div class="match-start-dock" data-match-start-dock><button class="match-start" type="button" data-action="home-start-match" aria-label="开始匹配"><span>开始匹配</span>${icon("arrowRight", 25)}</button></div>
  </div>`, "home");
}
