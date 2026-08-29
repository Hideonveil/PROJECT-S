import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";
import { availableGames, gameById, gameName } from "../game-catalog.js";
import { rankLabel } from "../ranks.js?v=20260821-rank-label-01";

export function homeWizardPathFor(filter) {
  const game = gameById(filter.game);
  const goal = filter.goal;
  if (!goal) return [{ key: "goal", label: "游戏目的" }];
  const mode = goal === "casual" ? "casual" : "ranked";
  const fields = game?.modes?.[mode]?.configurationSteps || [];
  const steps = [{ key: "goal", label: "游戏目的" }];
  const add = (key, label) => {
    if (!steps.some((step) => step.key === key)) steps.push({ key, label });
  };
  for (const field of fields) {
    if (field === "rank") add("rank", "段位");
    if (field === "position") add("roles", "位置");
    if (field === "microphone" || field === "preferredTotalPlayers") add("voice", "是否开麦");
  }
  return steps;
}

function option(value, label, on, action, iconName = "", multiple = false) {
  return `<button type="button" class="cursor-target home-filter-tag match-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${on}">
    ${iconName ? `<span class="match-option-icon">${icon(iconName, 20)}</span>` : ""}<span>${esc(label)}</span>${multiple ? `<small>${on ? "已选择" : "可多选"}</small>` : ""}<span class="match-option-check">${icon("check", 12)}</span>
  </button>`;
}

function goalOptions(filter, game) {
  const choices = [
    ["rank", "冲分", "trophy", "match-choice-art-slot--rank"],
    ["casual", "休闲", "dices", "match-choice-art-slot--casual"],
  ].filter(([value]) => game?.modes?.[value === "rank" ? "ranked" : "casual"]?.enabled);
  return `<div class="match-choice-cards match-choice-cards--goal" role="group" aria-label="游戏目的">
    ${choices.map(([value, label, iconName, artClass]) => {
      const mode = value === "rank" ? "ranked" : "casual";
      const asset = game?.assets?.modes?.[mode];
      return `<button type="button" class="cursor-target match-option match-choice-card ${filter.goal === value ? "is-on" : ""}" data-action="home-goal" data-value="${value}" aria-pressed="${filter.goal === value}">
      <span class="match-choice-art-slot ${artClass}" aria-hidden="true">${asset ? `<img src="${esc(asset.src)}" alt="" width="${Number(asset.width)}" height="${Number(asset.height)}" loading="eager" fetchpriority="high" decoding="async" />` : ""}</span>
      <span class="match-choice-card-body"><span class="match-choice-card-title"><span class="match-option-icon">${icon(iconName, 18)}</span><b>${label}</b><span class="match-option-check">${icon("check", 11)}</span></span></span>
    </button>`;
    }).join("")}
  </div>`;
}

function gameOptions(selected) {
  const games = availableGames("desktop");
  return `<div class="match-games-grid">
    ${games.length ? games.map((game) => {
      const on = selected === game.id;
      const asset = game.assets?.card;
      return `<button type="button" class="cursor-target match-option match-game-option match-game-option--${esc(game.id)} match-game-card home-filter-game-row ${on ? "is-on" : ""}" data-home-game="${esc(game.id)}" data-action="home-game" data-value="${esc(game.id)}" aria-pressed="${on}">
        <span class="match-game-art-slot match-game-card-media" aria-hidden="true">${asset ? `<img src="${esc(asset.src)}" alt="" width="${Number(asset.width)}" height="${Number(asset.height)}" loading="eager" fetchpriority="high" decoding="async" />` : ""}</span>
        <span class="match-game-option-main match-game-card-info"><span class="match-game-card-title-row"><span class="match-option-icon">${icon(game.icon || "gamepad2", 20)}</span><b>${esc(game.displayName)}</b><span class="match-option-check">${icon("arrowRight", 12)}</span></span></span>
      </button>`;
    }).join("") : `<article class="match-game-card match-game-card--soon" role="status"><span class="match-game-option-main match-game-card-info"><span class="match-game-card-title-row"><b>游戏目录暂不可用</b></span></span></article>`}
    <article class="match-game-card match-game-card--soon match-games-soon" role="note" aria-label="其他游戏即将开放">
      <span class="match-game-art-slot match-game-card-media" data-label="OTHER GAMES" aria-hidden="true"><img src="/assets/games/coming-soon-card.jpg" alt="" width="700" height="497" loading="eager" fetchpriority="high" decoding="async" /></span>
      <span class="match-game-option-main match-game-card-info"><span class="match-game-card-title-row"><span class="match-option-icon">${icon("sparkles", 20)}</span><b>COMING SOON</b></span></span>
    </article>
  </div>`;
}

function flowStepper(currentStep, steps, game) {
  return `<div class="match-wizard-stepper" data-home-stepper aria-label="${esc(game?.displayName || "游戏")} 配置进度：第 ${currentStep + 1} 步，共 ${steps.length} 步">
    ${steps.map((step, index) => {
      const status = index < currentStep ? "is-complete" : index === currentStep ? "is-active" : "is-pending";
      return `${index ? `<span class="match-wizard-line ${index <= currentStep ? "is-complete" : ""}" aria-hidden="true"><i></i></span>` : ""}<span class="match-wizard-marker ${status}"><b>${status === "is-complete" ? icon("check", 13) : String(index + 1).padStart(2, "0")}</b><em>${step.label}</em></span>`;
    }).join("")}
  </div>`;
}

export function homeFlowStepper(filter) {
  const game = gameById(filter.game);
  const path = homeWizardPathFor(filter);
  const step = Math.max(0, Math.min(path.length - 1, Number(filter.step) || 0));
  return flowStepper(step, path, game);
}

function roleOptions(values, selected, action, label) {
  const options = [{ code: null, label: "不限", roleLabel: "不限" }, ...values];
  return `<div class="match-role-picker">
    <div class="match-role-multi" role="note"><strong>${esc(label)}</strong><b>可多选</b><span>选择一个或多个号位</span></div>
    <div class="match-options match-options--roles" role="group" aria-label="${esc(label)}，可多选">${options.map((option) => {
      const value = option.label;
      const number = option.code ?? "";
      const on = selected.includes(value);
      const roleLabel = option.roleLabel;
      const roleAriaLabel = value === "不限" ? "不限" : `${value}，${roleLabel}`;
      return `<button type="button" class="cursor-target home-filter-tag match-option match-role-option ${on ? "is-on" : ""}" data-action="${action}" data-value="${esc(value)}" aria-label="${esc(roleAriaLabel)}" aria-pressed="${on}">
        <span class="match-role-number">${value === "不限" ? "" : esc(number)}</span><span class="match-role-label">${esc(roleLabel)}</span><span class="match-option-check">${icon("check", 12)}</span>
      </button>`;
    }).join("")}</div>
  </div>`;
}

function rankOptions(game, selected) {
  return `<div class="match-options match-options--ranks" role="group" aria-label="当前段位">${(game?.rankOptions || []).map((rank, index) => {
    const { code, name, subtitle: material, asset } = rank;
    const on = selected === code;
    const artAdjustment = rank.artClass ? ` ${esc(rank.artClass)}` : "";
    return `<button type="button" class="cursor-target home-filter-tag match-option match-rank-option${artAdjustment} ${on ? "is-on" : ""}" data-action="home-rank" data-value="${esc(code)}" aria-pressed="${on}">
      <span class="match-rank-art-slot" aria-hidden="true">${asset ? `<img src="${esc(asset.src)}" alt="" width="${Number(asset.width)}" height="${Number(asset.height)}" loading="eager" fetchpriority="${index < 4 ? "high" : "auto"}" decoding="auto" />` : ""}</span><span class="match-rank-card-body"><span class="match-rank-name">${esc(name)}</span>${material ? `<small>${esc(material)}</small>` : ""}<span class="match-option-check">${icon("check", 11)}</span></span>
    </button>`;
  }).join("")}</div>`;
}

function wizardContent(filter, stepKey, game) {
  if (stepKey === "goal") {
    return goalOptions(filter, game);
  }
  if (stepKey === "rank") return `<div class="match-rank-panel"><p class="match-rank-policy-note" role="note">${icon("shieldCheck", 16)}<span>我们会遵守 ${esc(game?.displayName || "游戏")} 的匹配硬规则，不会为了缩短等待而突破限制。</span></p>${rankOptions(game, filter.rank)}</div>`;
  if (stepKey === "roles") {
    return `<div class="match-role-groups">
      ${roleOptions(game?.positionOptions || [], filter.ownRoles, "home-own-role", "我的位置")}
      ${roleOptions(game?.positionOptions || [], filter.teammateRoles, "home-teammate-role", "希望队友位置")}
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
      ${filter.goal === "casual" ? `<section class="match-casual-preference" aria-labelledby="casual-preferred-total-title">
        <div class="match-role-multi"><strong id="casual-preferred-total-title">偏好人数</strong><b>可选</b><span>只影响优先顺序，不会错过合适玩家</span></div>
        <div class="match-options match-options--voice" role="group" aria-label="偏好房间总人数">
          ${option("any", "不限", !filter.preferredTotalPlayers, "home-preferred-total", "users")}
          ${Array.from({ length: Math.max(1, Number(game?.modes?.casual?.hardMaxPlayers || 2) - 1) }, (_, index) => index + 2).map((total) => option(String(total), `${total} 人`, Number(filter.preferredTotalPlayers) === total, "home-preferred-total")).join("")}
        </div>
        <p class="match-rank-policy-note" role="note">${icon("info", 16)}<span>系统仍会优先补进已有 Room；人数偏好不是硬门槛。</span></p>
      </section>` : ""}
    </div>`;
  }
  return "";
}

function wizardCopy(stepKey, goal) {
  const copy = {
    goal: ["目标", "冲分或休闲。"],
    rank: ["你的当前段位？", ""],
    roles: ["你想玩几号位？", ""],
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
  const game = gameById(filter.game);
  return `<section class="match-coming-soon match-stage-enter" aria-live="polite">
    <span>COMING SOON / ${esc(game?.displayName || "GAME")}</span><h2>${esc(game?.displayName || "这个游戏")}还在准备。</h2><p>入口已经留下，但当前还没有启用完整匹配规则。</p>
    <button type="button" class="match-wizard-back" data-action="home-back-games">${icon("chevronLeft", 18)}<span>返回选择游戏</span></button>
  </section>`;
}

function configuredGameStage(filter, game) {
  const path = homeWizardPathFor(filter);
  const step = Math.max(0, Math.min(path.length - 1, Number(filter.step) || 0));
  const stepKey = path[step].key;
  const [title, description] = wizardCopy(stepKey, filter.goal);
  const isLast = step === path.length - 1;
  const targetCursorAttr = stepKey === "team" ? "" : " data-target-cursor-zone";
  const progress = filter.goal
    ? flowStepper(step, path, game)
    : `<div class="match-wizard-stepper" data-home-stepper hidden aria-hidden="true"></div>`;
  const advance = filter.goal
    ? isLast
      ? `<div class="match-start-dock" data-match-start-dock><button class="match-start" type="button" data-action="home-start-match" aria-label="开始匹配"><span>开始匹配</span>${icon("arrowRight", 25)}</button></div>`
      : `<button type="button" class="match-wizard-next" data-action="home-wizard-next"><span>下一步</span>${icon("arrowRight", 20)}</button>`
    : "";
  return `<section class="match-wizard">
    ${progress}
    <div class="match-wizard-stage ${filter.direction < 0 ? "is-backward" : "is-forward"}" data-home-wizard-stage data-home-step="${esc(stepKey)}">
      <div class="match-wizard-copy"><span>${esc(String(game?.displayName || "GAME").toUpperCase())} / ${String(step + 1).padStart(2, "0")}</span><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div>
      <div class="match-wizard-options match-target-zone"${targetCursorAttr}>${wizardContent(filter, stepKey, game)}</div>
      <footer class="match-wizard-actions">
        <div class="match-wizard-actions-left">
          <button type="button" class="match-wizard-back" data-action="home-wizard-back">${icon("chevronLeft", 18)}<span>${step === 0 ? "返回游戏" : "上一步"}</span></button>
          ${step > 0 ? `<button type="button" class="match-back-games" data-action="home-back-games">${icon("gamepad2", 16)}<span>返回选择游戏</span></button>` : ""}
        </div>
        <div data-home-wizard-advance ${filter.goal ? "" : "hidden"}>${advance}</div>
      </footer>
    </div>
  </section>`;
}

function rolesLabel(roles, gameId) {
  const list = Array.isArray(roles) ? roles : [];
  const positions = gameById(gameId)?.positionOptions || [];
  return list.length ? list.map((role) => {
    const key = String(role).endsWith("号位") ? String(role) : `${role}号位`;
    return positions.find((position) => position.code === Number(role) || position.label === key)?.roleLabel || role;
  }).join(" / ") : "位置不限";
}

export function matchingDirectoryPersonMarkup(person, extraClass = "") {
  const resolvedGameName = gameName(person.gameId, person.gameId || "游戏");
  return `<article class="match-directory-player ${extraClass}" data-home-directory-person aria-label="正在匹配的玩家 ${esc(person.nickname || "玩家")}">
    <span class="match-directory-player-mark" aria-hidden="true">${icon("check", 13)}</span>
    <div class="match-directory-player-copy">
      <div class="match-directory-player-top"><b>${esc(person.nickname || "玩家")}</b><span>${person.mode === "casual" ? "休闲" : "冲分"}</span></div>
      <p>${esc(resolvedGameName)} · ${person.mode === "casual" ? "轻松开黑" : esc(rankLabel(person.rankCode, "段位待定", person.gameId))}</p>
      <footer><span>${esc(rolesLabel(person.desiredRoles, person.gameId))}</span><i>${person.microphonePreference === "on" ? "开麦" : person.microphonePreference === "off" ? "不开麦" : "都可以"}</i></footer>
    </div>
  </article>`;
}

export function matchingDirectoryMarkup(entries = []) {
  const people = Array.isArray(entries) ? entries.slice(0, 6) : [];
  return people.map((person) => matchingDirectoryPersonMarkup(person)).join("");
}

function matchingDirectory(entries) {
  const people = Array.isArray(entries) ? entries.slice(0, 6) : [];
  return `<aside class="match-directory match-directory--signal-card" data-directory-activity aria-label="正在摇人的玩家">
    <div class="match-directory-caution" aria-hidden="true"><span>NEVER PLAY ALONE / NOW MATCHING /</span></div>
    <header class="match-directory-head"><span><i></i>NOW MATCHING</span></header>
    <div class="match-directory-list match-directory-list--activity" id="home-directory-list">
      ${people.length
        ? matchingDirectoryMarkup(people)
        : `<div class="match-directory-empty"><span class="match-directory-empty-mark" aria-hidden="true">+</span><b>等待玩家中</b></div>`}
    </div>
    <footer class="match-directory-livebar"><span><i></i>实时更新中</span></footer>
  </aside>`;
}

export function homePage(state, filter) {
  const game = gameById(filter.game);
  const stage = !filter.game
    ? gameStage("")
    : game?.status === "available" && game.supportedClients?.includes("desktop")
      ? configuredGameStage(filter, game)
      : comingSoonStage(filter);
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
