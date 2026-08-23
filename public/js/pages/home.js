import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { GAMES } from "../data.js";
import { rankLabel } from "../ranks.js?v=20260821-rank-label-01";

const GAME_ICONS = { deadlock: "swords" };
const DEADLOCK_ROLES = ["1号位", "2号位", "3号位", "4号位", "5号位", "6号位"];
const DEADLOCK_ROLE_LABELS = {
  "1号位": "主核",
  "2号位": "伪核",
  "3号位": "坦克",
  "4号位": "游走",
  "5号位": "辅助",
  "6号位": "功能",
};
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
const DEADLOCK_RANK_ARTS = [
  "/assets/ranks/01-initiate.png",
  "/assets/ranks/02-seeker.png",
  "/assets/ranks/03-acolyte.png",
  "/assets/ranks/04-sentinel.png",
  "/assets/ranks/05-mystic.png",
  "/assets/ranks/06-ritualist.png",
  "/assets/ranks/07-emissary.png",
  "/assets/ranks/08-oracle.png",
  "/assets/ranks/09-phantom.png",
  "/assets/ranks/10-ascendant.png",
  "/assets/ranks/11-eternus.png",
];
const DEADLOCK_TIMES = ["现在", "30分钟后", "1小时后"];

const DEADLOCK_PATHS = {
  rank: [
    { key: "goal", label: "游戏目的" },
    { key: "rank", label: "段位" },
    { key: "roles", label: "位置" },
    { key: "voice", label: "是否开麦" },
  ],
  casual: [
    { key: "goal", label: "游戏目的" },
    { key: "team", label: "队友人数" },
    { key: "voice", label: "是否开麦" },
  ],
};

function option(value, label, on, action, iconName = "", multiple = false) {
  return `<button type="button" class="cursor-target home-filter-tag match-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${on}">
    ${iconName ? `<span class="match-option-icon">${icon(iconName, 20)}</span>` : ""}<span>${esc(label)}</span>${multiple ? `<small>${on ? "已选择" : "可多选"}</small>` : ""}<span class="match-option-check">${icon("check", 12)}</span>
  </button>`;
}

function goalOptions(filter) {
  const choices = [
    ["rank", "冲分", "trophy", "match-choice-art-slot--rank"],
    ["casual", "休闲", "dices", "match-choice-art-slot--casual"],
  ];
  return `<div class="match-choice-cards match-choice-cards--goal" role="group" aria-label="游戏目的">
    ${choices.map(([value, label, iconName, artClass]) => `<button type="button" class="cursor-target match-option match-choice-card ${filter.goal === value ? "is-on" : ""}" data-action="home-goal" data-value="${value}" aria-pressed="${filter.goal === value}">
      <span class="match-choice-art-slot ${artClass}" aria-hidden="true"><img src="${value === "rank" ? "/assets/modes/rank-hero.jpg" : "/assets/modes/casual-hero.jpg"}" alt="" loading="lazy" decoding="async" /></span>
      <span class="match-choice-card-body"><span class="match-choice-card-title"><span class="match-option-icon">${icon(iconName, 18)}</span><b>${label}</b><span class="match-option-check">${icon("check", 11)}</span></span></span>
    </button>`).join("")}
  </div>`;
}

function gameOptions(selected) {
  const game = GAMES.find((item) => item.id === "deadlock");
  const on = selected === "deadlock";
  return `<div class="match-games-grid">
    <button type="button" class="cursor-target match-option match-game-option match-game-option--deadlock match-game-card home-filter-game-row ${on ? "is-on" : ""}" data-home-game="deadlock" data-action="home-game" data-value="deadlock" aria-pressed="${on}">
      <span class="match-game-art-slot match-game-card-media" aria-hidden="true"></span>
      <span class="match-game-option-main match-game-card-info"><span class="match-game-card-title-row"><span class="match-option-icon">${icon(GAME_ICONS.deadlock, 20)}</span><b>${esc(game?.name || "Deadlock")}</b><span class="match-option-check">${icon("arrowRight", 12)}</span></span></span>
    </button>
    <article class="match-game-card match-game-card--soon match-games-soon" role="note" aria-label="其他游戏即将开放">
      <span class="match-game-art-slot match-game-card-media" data-label="OTHER GAMES" aria-hidden="true"><img src="/assets/games/coming-soon.png" alt="" loading="lazy" decoding="async" /></span>
      <span class="match-game-option-main match-game-card-info"><span class="match-game-card-title-row"><span class="match-option-icon">${icon("sparkles", 20)}</span><b>COMING SOON</b></span></span>
    </article>
  </div>`;
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

function roleOptions(values, selected, action, label) {
  return `<div class="match-role-picker">
    <div class="match-role-multi" role="note"><strong>${esc(label)}</strong><b>可多选</b><span>选择一个或多个号位</span></div>
    <div class="match-options match-options--roles" role="group" aria-label="${esc(label)}，可多选">${["不限", ...values].map((value) => {
      const number = value.replace("号位", "");
      const on = selected.includes(value);
      const roleLabel = value === "不限" ? "不限" : DEADLOCK_ROLE_LABELS[value];
      const roleAriaLabel = value === "不限" ? "不限" : `${value}，${roleLabel}`;
      return `<button type="button" class="cursor-target home-filter-tag match-option match-role-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-label="${esc(roleAriaLabel)}" aria-pressed="${on}">
        <span class="match-role-number">${value === "不限" ? "" : esc(number)}</span><span class="match-role-label">${esc(roleLabel)}</span><span class="match-option-check">${icon("check", 12)}</span>
      </button>`;
    }).join("")}</div>
  </div>`;
}

function rankOptions(selected) {
  return `<div class="match-options match-options--ranks" role="group" aria-label="当前段位">${DEADLOCK_RANKS.map(([name, material], index) => {
    const value = material ? `${name}（${material}）` : name;
    const on = selected === value;
    const artAdjustment = [
      index < 8 ? "match-rank-option--upper" : "",
      index >= 4 && index <= 7 ? "match-rank-option--second-row" : "",
      index === 1 ? "match-rank-option--seeker" : "",
      index === 2 ? "match-rank-option--acolyte" : "",
      index === 3 ? "match-rank-option--sentinel" : "",
      index === 7 ? "match-rank-option--oracle" : "",
      index === 8 ? "match-rank-option--phantom" : "",
    ].filter(Boolean).map((className) => ` ${className}`).join("");
    return `<button type="button" class="cursor-target home-filter-tag match-option match-rank-option${artAdjustment} ${on ? "is-on" : ""}" data-action="home-rank" data-value="${esc(value)}" aria-pressed="${on}">
      <span class="match-rank-art-slot" aria-hidden="true"><img src="${DEADLOCK_RANK_ARTS[index]}" alt="" decoding="async" /></span><span class="match-rank-card-body"><span class="match-rank-name">${esc(name)}</span>${material ? `<small>${esc(material)}</small>` : ""}<span class="match-option-check">${icon("check", 11)}</span></span>
    </button>`;
  }).join("")}</div>`;
}

function wizardContent(filter, stepKey) {
  if (stepKey === "goal") {
    return goalOptions(filter);
  }
  if (stepKey === "rank") return `<div class="match-rank-panel"><p class="match-rank-policy-note" role="note">${icon("shieldCheck", 16)}<span>我们会遵守 Deadlock 官方匹配规则，不会为了缩短等待而突破硬性组队限制。</span></p>${rankOptions(filter.rank)}</div>`;
  if (stepKey === "roles") {
    return `<div class="match-role-groups">
      ${roleOptions(DEADLOCK_ROLES, filter.ownRoles, "home-own-role", "我的位置")}
      ${roleOptions(DEADLOCK_ROLES, filter.teammateRoles, "home-teammate-role", "希望队友位置")}
    </div>`;
  }
  if (stepKey === "voice") {
    return `<div class="match-choice-stack">
      ${filter.goal === "rank" ? `<p class="match-rank-note" role="note">${icon("mic", 18)}<span><b>冲分最好开麦哦</b><small>及时沟通位置与团战信息，配合会更稳定。</small></span></p>` : ""}
      <div class="match-options match-options--voice" role="group" aria-label="是否开麦">
        ${option("on", "开麦", filter.voice === "on", "home-voice", "mic")}
        ${option("off", "不开麦", filter.voice === "off", "home-voice", "volumeX")}
        ${option("any", "无所谓", filter.voice === "any", "home-voice", "circleDot")}
      </div>
    </div>`;
  }
  if (stepKey === "team") {
    const min = Math.min(5, Math.max(1, Number(filter.teamMin ?? filter.team ?? 1) || 1));
    const max = Math.max(min, Math.min(5, Number(filter.teamMax ?? filter.team ?? min) || min));
    const minPercent = ((min - 1) / 4) * 100;
    const maxPercent = ((max - 1) / 4) * 100;
    const summary = min === max ? `严格匹配 ${min} 位队友` : `接受 ${min}–${max} 位队友`;
    const detents = [1, 2, 3, 4, 5].map((value) => `<span class="match-team-range-detent${value >= min && value <= max ? " is-active" : ""}${value === min || value === max ? " is-edge" : ""}" data-team-range-detent="${value}" style="left:${((value - 1) / 4) * 100}%"><i></i><b>${value}</b></span>`).join("");
    return `<div class="match-team-range" data-home-team-range role="group" aria-label="可接受的队友人数" style="--team-range-min:${minPercent}%;--team-range-max:${maxPercent}%;--team-range-fill-left:${minPercent}%;--team-range-fill-right:${100 - maxPercent}%">
      <div class="match-team-range-head"><strong data-team-range-summary>${summary}</strong></div>
      <div class="match-team-range-track-wrap" data-home-team-range-track>
        <div class="match-team-range-track" aria-hidden="true"><i data-team-range-fill></i><span class="match-team-range-track-glow"></span></div>
        <div class="match-team-range-detents" aria-hidden="true">${detents}</div>
        <span class="match-team-range-thumb match-team-range-thumb--min" data-team-range-thumb="min" aria-hidden="true"><i>MIN</i></span>
        <span class="match-team-range-thumb match-team-range-thumb--max" data-team-range-thumb="max" aria-hidden="true"><i>MAX</i></span>
        <input class="match-team-range-input match-team-range-input--min" type="range" min="1" max="${max}" step="1" value="${min}" data-home-team-range-input="min" aria-label="最少接受 ${min} 位队友" />
        <input class="match-team-range-input match-team-range-input--max" type="range" min="${min}" max="5" step="1" value="${max}" data-home-team-range-input="max" aria-label="最多接受 ${max} 位队友" />
      </div>
      <div class="match-team-range-labels" aria-hidden="true"><span>1 位</span><span>2 位</span><span>3 位</span><span>4 位</span><span>5 位</span></div>
    </div>`;
  }
  return `<div class="match-options match-options--time" role="group" aria-label="什么时候玩">${DEADLOCK_TIMES.map((time, index) => option(time, time, filter.time === time, "home-time", index === 0 ? "zap" : "clock")).join("")}</div>`;
}

function wizardCopy(stepKey, goal) {
  const copy = {
    goal: ["目标", "冲分或休闲。"],
    rank: ["你的当前段位？", ""],
    roles: ["你想玩几号位？", ""],
    team: ["想找几位队友？", ""],
    voice: ["要不要开麦？", ""],
  };
  return copy[stepKey] || copy.goal;
}

function gameStage(selectedGame) {
  return `<section class="match-game-stage match-stage-enter" aria-labelledby="match-game-title">
    <div class="match-stage-copy"><span>GAME SELECT / 00</span><h2 id="match-game-title">选择游戏</h2></div>
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
  const targetCursorAttr = stepKey === "team" ? "" : " data-target-cursor-zone";
  return `<section class="match-wizard">
    ${flowStepper(step, path)}
    <div class="match-wizard-stage ${filter.direction < 0 ? "is-backward" : "is-forward"}" data-home-wizard-stage data-home-step="${esc(stepKey)}">
      <div class="match-wizard-copy"><span>DEADLOCK / ${String(step + 1).padStart(2, "0")}</span><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div>
      <div class="match-wizard-options match-target-zone"${targetCursorAttr}>${wizardContent(filter, stepKey)}</div>
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

function rolesLabel(roles) {
  const list = Array.isArray(roles) ? roles : [];
  return list.length ? list.map((role) => {
    const key = String(role).endsWith("号位") ? String(role) : `${role}号位`;
    return DEADLOCK_ROLE_LABELS[key] || role;
  }).join(" / ") : "位置不限";
}

export function matchingDirectoryPersonMarkup(person, extraClass = "") {
  const gameName = person.gameId === "deadlock" || !person.gameId ? "Deadlock" : person.gameId;
  return `<article class="match-directory-player ${extraClass}" data-home-directory-person aria-label="正在匹配的玩家 ${esc(person.nickname || "玩家")}">
    <div class="match-directory-player-top"><b>${esc(person.nickname || "玩家")}</b><span>${person.mode === "casual" ? "休闲" : "冲分"}</span></div>
    <p>${esc(gameName)} · ${person.mode === "casual" ? "轻松开黑" : esc(rankLabel(person.rankCode, "段位待定"))}</p>
    <footer><span>${esc(rolesLabel(person.desiredRoles))}</span><i>${person.microphonePreference === "on" ? "开麦" : person.microphonePreference === "off" ? "不开麦" : "都可以"}</i></footer>
  </article>`;
}

export function matchingDirectoryMarkup(entries = []) {
  const people = Array.isArray(entries) ? entries.slice(0, 6) : [];
  return people.map((person) => matchingDirectoryPersonMarkup(person)).join("");
}

function matchingDirectory(entries) {
  const people = Array.isArray(entries) ? entries.slice(0, 6) : [];
  return `<aside class="match-directory" data-directory-activity aria-label="正在摇人的玩家">
    <header><span><i></i>NOW MATCHING</span><b>正在摇人</b></header>
    <div class="match-directory-list match-directory-list--activity" id="home-directory-list">
      ${people.length
        ? matchingDirectoryMarkup(people)
        : `<div class="match-directory-empty"><b>还没有公开的匹配请求</b><span>第一个开始摇人的人，会出现在这里。</span></div>`}
    </div>
  </aside>`;
}

export function homePage(state, filter) {
  const stage = !filter.game ? gameStage("") : filter.game === "deadlock" ? deadlockStage(filter) : comingSoonStage(filter);
  return homeShell(state, `<div class="match-workspace">
    <header class="match-head">
      <div><div class="match-eyebrow">01 / MATCH</div><h1>摇人</h1><p>总有人想一起玩</p></div>
      <div class="match-head-tools">
        <button type="button" class="match-contact" data-action="open-feedback">${icon("messageSquare", 18)}<span><b>联系我们</b><small>CONTACT / OPS</small></span></button>
      </div>
    </header>
    <div class="match-content-grid"><div class="match-primary-stage">${stage}</div>${matchingDirectory(state.match.directory)}</div>
  </div>`, "home");
}
