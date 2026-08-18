import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { GAMES, HOME_GAME_IDS } from "../data.js";

const GAME_ICONS = { hok: "trophy", valorant: "target", deadlock: "swords", minecraft: "gamepad2" };
const DEADLOCK_ROLES = ["1号位", "2号位", "3号位", "4号位", "5号位", "6号位"];
const DEADLOCK_RANKS = [
  ["新人", "砖石"],
  ["行者", "岩砾"],
  ["侍从", "镔铁"],
  ["近卫", "青铜"],
  ["秘士", "白银"],
  ["侍祭", "黄金"],
  ["蜜使", "铂金"],
  ["神谕者", "钻石"],
  ["幽虚影", ""],
  ["凌世君", ""],
  ["不朽之星", ""],
];
const DEADLOCK_TIMES = ["现在", "30分钟后", "1小时后"];

const DEADLOCK_PATHS = {
  rank: [
    { key: "goal", label: "游戏目的" },
    { key: "rank", label: "段位" },
    { key: "teammateRoles", label: "队友位置" },
    { key: "voice", label: "是否开麦" },
  ],
  casual: [
    { key: "goal", label: "游戏目的" },
    { key: "teammateRoles", label: "队友位置" },
    { key: "voice", label: "是否开麦" },
  ],
};

function option(value, label, on, action, iconName = "", multiple = false) {
  return `<button type="button" class="cursor-target home-filter-tag match-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${on}">
    ${iconName ? `<span class="match-option-icon">${icon(iconName, 20)}</span>` : ""}<span>${esc(label)}</span>${multiple ? `<small>${on ? "已选择" : "可多选"}</small>` : ""}<span class="match-option-check">${icon("check", 12)}</span>
  </button>`;
}

function gameOptions(selected) {
  return HOME_GAME_IDS.map((id) => {
    const game = GAMES.find((item) => item.id === id);
    if (!game) return "";
    const on = id === selected;
    const ready = id === "deadlock";
    return `<button type="button" class="cursor-target match-option match-game-option home-filter-game-row ${on ? "is-on" : ""} ${ready ? "is-ready" : "is-soon"}" data-home-game="${esc(id)}" data-action="home-game" data-value="${esc(id)}" aria-pressed="${on}">
      <span class="match-option-icon">${icon(GAME_ICONS[id] || "gamepad2", 22)}</span><span>${esc(game.name)}</span><small>${ready ? "AVAILABLE / 01" : "COMING SOON"}</small><span class="match-option-check">${icon("arrowRight", 12)}</span>
    </button>`;
  }).join("");
}

function flowStepper(currentStep, steps) {
  return `<div class="match-wizard-stepper" data-home-stepper aria-label="Deadlock 配置进度：第 ${currentStep + 1} 步，共 ${steps.length} 步">
    ${steps.map((step, index) => {
      const status = index < currentStep ? "is-complete" : index === currentStep ? "is-active" : "is-pending";
      return `${index ? `<span class="match-wizard-line ${index <= currentStep ? "is-complete" : ""}" aria-hidden="true"><i></i></span>` : ""}<span class="match-wizard-marker ${status}"><b>${status === "is-complete" ? icon("check", 13) : String(index + 1).padStart(2, "0")}</b><em>${step.label}</em></span>`;
    }).join("")}
  </div>`;
}

export function homeFlowStepper(filter) {
  const path = DEADLOCK_PATHS[filter.goal === "casual" ? "casual" : "rank"];
  const step = Math.max(0, Math.min(path.length - 1, Number(filter.step) || 0));
  return flowStepper(step, path);
}

function roleOptions(values, selected, action) {
  return `<div class="match-role-picker">
    <div class="match-role-multi" role="note"><b>可多选</b><span>选择一个或多个号位</span></div>
    <div class="match-options match-options--roles" role="group" aria-label="位置，可多选">${["不限", ...values].map((value) => {
      const number = value.replace("号位", "");
      const on = selected.includes(value);
      return `<button type="button" class="cursor-target home-filter-tag match-option match-role-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-label="${esc(value)}" aria-pressed="${on}">
        <span class="match-role-number">${esc(number)}${value === "不限" ? "" : "<small>号位</small>"}</span><span class="match-option-check">${icon("check", 12)}</span>
      </button>`;
    }).join("")}</div>
  </div>`;
}

function rankOptions(selected) {
  return `<div class="match-options match-options--ranks" role="group" aria-label="当前段位">${DEADLOCK_RANKS.map(([name, material]) => {
    const value = material ? `${name}（${material}）` : name;
    const on = selected === value;
    return `<button type="button" class="cursor-target home-filter-tag match-option match-rank-option ${on ? "is-on" : ""}" data-action="home-rank" data-value="${esc(value)}" aria-pressed="${on}">
      <span class="match-rank-name">${esc(name)}</span>${material ? `<small>${esc(material)}</small>` : ""}<span class="match-option-check">${icon("check", 12)}</span>
    </button>`;
  }).join("")}</div>`;
}

function wizardContent(filter, stepKey) {
  if (stepKey === "goal") {
    return `<div class="match-options match-options--goal" role="group" aria-label="游戏目的">
      ${option("rank", "上分", filter.goal === "rank", "home-goal", "trophy")}
      ${option("casual", "娱乐", filter.goal === "casual", "home-goal", "dices")}
    </div>`;
  }
  if (stepKey === "rank") return rankOptions(filter.rank);
  if (stepKey === "ownRoles") return roleOptions(DEADLOCK_ROLES, filter.ownRoles, "home-own-role");
  if (stepKey === "teammateRoles") return roleOptions(DEADLOCK_ROLES, filter.teammateRoles, "home-teammate-role");
  if (stepKey === "voice") {
    return `<div class="match-choice-stack">
      ${filter.goal === "rank" ? `<p class="match-rank-note" role="note">${icon("mic", 18)}<span><b>上分最好开麦哦</b><small>及时沟通位置与团战信息，配合会更稳定。</small></span></p>` : ""}
      <div class="match-options match-options--voice" role="group" aria-label="是否开麦">
        ${option("on", "开麦", filter.voice === "on", "home-voice", "mic")}
        ${option("off", "不开麦", filter.voice === "off", "home-voice", "volumeX")}
        ${option("any", "无所谓", filter.voice === "any", "home-voice", "circleDot")}
      </div>
    </div>`;
  }
  if (stepKey === "team") {
    return `<div class="match-options match-options--team" role="group" aria-label="找几个人">${[1, 2, 3, 4, 5].map((count) => option(String(count), `找 ${count} 人`, Number(filter.team) === count, "home-team", "users")).join("")}</div>`;
  }
  return `<div class="match-options match-options--time" role="group" aria-label="什么时候玩">${DEADLOCK_TIMES.map((time, index) => option(time, time, filter.time === time, "home-time", index === 0 ? "zap" : "clock")).join("")}</div>`;
}

function wizardCopy(stepKey, goal) {
  const copy = {
    goal: ["先决定这局为了什么。", "选择上分会进入位置配置；选择娱乐则直接寻找轻松开黑的玩家。"],
    rank: ["你现在是什么段位？", "选择当前段位，后续用于寻找进度更接近的队友。"],
    teammateRoles: ["希望队友补哪个位置？", "可以多选；选择不限时不会限制队友位置。"],
    voice: ["这局要不要开麦？", goal === "rank" ? "上分默认开麦，你仍然可以改成不开麦。" : "娱乐局默认开麦，不做额外要求。"],
  };
  return copy[stepKey] || copy.goal;
}

function gameStage(selectedGame) {
  return `<section class="match-game-stage match-stage-enter" aria-labelledby="match-game-title">
    <div class="match-stage-copy"><span>GAME SELECT / 00</span><h2 id="match-game-title">先选一个游戏。</h2><p>目前先开放 Deadlock 的匹配配置。其他游戏的入口保留，后续逐个上线。</p></div>
    <div class="match-options match-options--games match-target-zone" data-target-cursor-zone role="group" aria-label="选择游戏">${gameOptions(selectedGame)}</div>
  </section>`;
}

function comingSoonStage(filter) {
  const game = GAMES.find((item) => item.id === filter.game);
  return `<section class="match-coming-soon match-stage-enter" aria-live="polite">
    <span>COMING SOON / ${esc(game?.name || "GAME")}</span><h2>${esc(game?.name || "这个游戏")}还在准备。</h2><p>入口已经留下，但本阶段只制作 Deadlock 的配置流程。</p>
    <button type="button" class="match-wizard-back" data-action="home-back-games">${icon("chevronLeft", 18)}<span>返回选择游戏</span></button>
  </section>`;
}

function deadlockStage(filter) {
  const path = DEADLOCK_PATHS[filter.goal === "casual" ? "casual" : "rank"];
  const step = Math.max(0, Math.min(path.length - 1, Number(filter.step) || 0));
  const stepKey = path[step].key;
  const [title, description] = wizardCopy(stepKey, filter.goal);
  const isLast = step === path.length - 1;
  return `<section class="match-wizard">
    ${flowStepper(step, path)}
    <div class="match-wizard-stage ${filter.direction < 0 ? "is-backward" : "is-forward"}" data-home-wizard-stage data-home-step="${esc(stepKey)}">
      <div class="match-wizard-copy"><span>DEADLOCK / ${String(step + 1).padStart(2, "0")}</span><h2>${title}</h2><p>${description}</p></div>
      <div class="match-wizard-options match-target-zone" data-target-cursor-zone>${wizardContent(filter, stepKey)}</div>
      <footer class="match-wizard-actions">
        <div class="match-wizard-actions-left">
          <button type="button" class="match-wizard-back" data-action="home-wizard-back">${icon("chevronLeft", 18)}<span>${step === 0 ? "返回游戏" : "上一步"}</span></button>
          ${step > 0 ? `<button type="button" class="match-back-games" data-action="home-back-games">${icon("gamepad2", 16)}<span>返回选择游戏</span></button>` : ""}
        </div>
        ${isLast
          ? `<div class="match-start-dock" data-match-start-dock><button class="match-start" type="button" data-action="home-start-match" aria-label="开始匹配"><span>开始匹配</span>${icon("arrowRight", 25)}</button></div>`
          : `<button type="button" class="match-wizard-next" data-action="home-wizard-next"><span>下一步</span>${icon("arrowRight", 20)}</button>`}
      </footer>
    </div>
  </section>`;
}

export function homePage(state, filter) {
  const pool = Math.max(0, Number(state.match.pool || 0));
  const stage = !filter.game ? gameStage("") : filter.game === "deadlock" ? deadlockStage(filter) : comingSoonStage(filter);
  return homeShell(state, `<div class="match-workspace">
    <header class="match-head">
      <div><div class="match-eyebrow">01 / MATCH</div><h1>摇人</h1><p>总有人想一起玩</p></div>
      <div class="match-live" aria-label="匹配池状态"><span></span><b>匹配池在线</b><i>·</i><em>${pool ? `${pool} 人正在找队友` : "等待新的玩家"}</em></div>
    </header>
    ${stage}
  </div>`, "home");
}
