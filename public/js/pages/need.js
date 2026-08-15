import { icon } from "../icons.js";
import { button, esc, homeShell } from "../ui.js";
import { GAMES } from "../data.js";
import { FLOW } from "../flow.js";

const STEPS = [
  { id: "game", label: "GAME" },
  { id: "activity", label: "ACTIVITY" },
  { id: "people", label: "PEOPLE" },
  { id: "time", label: "TIME" },
  { id: "team", label: "TEAM" },
  { id: "details", label: "DETAILS" },
  { id: "confirm", label: "CONFIRM" },
];

const TITLES = {
  game: "你想玩什么？",
  activity: "这次想怎么玩？",
  people: "想和什么样的人一起玩？",
  time: "什么时候玩？",
  team: "现在有几个人？",
  details: "还有什么要求？",
  confirm: "确认你的本次需求",
};

const SUBS = {
  game: "选一个此刻真正想玩的游戏，后面的选项会跟着它变。",
  activity: "只描述这一局，不同游戏的选项不一样。",
  people: "这些标签会进入匹配依据，也可以不选。",
  time: "核心是找到此刻也想玩的真人。",
  team: "支持玩家和队伍互相寻找。",
  details: "都可以跳过，系统会按你的基础身份找。",
  confirm: "最后看一眼，点开始寻找就进入实时匹配池。",
};

function gameById(id) {
  return GAMES.find((g) => g.id === id) || GAMES[0];
}

function flowFor(id) {
  return FLOW[id] || {};
}

function countLabel(n) {
  return n >= 4 ? "4人+" : `${n}人`;
}

function durationLabel(value) {
  if (value === "不限") return "时长不限";
  if (value === "60") return "1小时";
  if (value === "120") return "2小时";
  if (value === "180") return "3小时+";
  return `${value} 分钟`;
}

function computePlayerType(draft) {
  const parts = [draft.style, ...(draft.selectedTags || [])].filter(Boolean);
  return parts.length ? parts.join(" / ") : "不限";
}

function activeIndex(step) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return idx < 0 ? 0 : idx;
}

function progress(step) {
  const current = activeIndex(step);
  return `<div class="flow-progress">
    ${STEPS.map((s, i) => {
      const cls =
        i === current ? "flow-progress__item--active" : i < current ? "flow-progress__item--done" : "";
      return `<div class="flow-progress__item ${cls}"><span class="flow-progress__dot"></span><span>${s.label}</span></div>`;
    }).join("")}
  </div>`;
}

function question(title, inner) {
  return `<div class="flow-question">${esc(title)}</div>${inner}`;
}

function gameStep(draft) {
  const q = String(draft.wizardSearch || "").trim().toLowerCase();
  const games = GAMES.filter(
    (g) => !q || `${g.name} ${g.tag} ${g.modes.join(" ")}`.toLowerCase().includes(q)
  );
  return `
    <div class="flow-search">
      ${icon("search", 15)}
      <input class="input flow-search__input" data-flow-search placeholder="搜索游戏" value="${esc(draft.wizardSearch || "")}" />
    </div>
    <div class="flow-game-grid">
      ${games
        .map(
          (g) => `<button type="button" class="flow-game-card ${draft.game === g.id ? "flow-game-card--on" : ""}" data-action="wizard-game" data-value="${g.id}" data-game-name="${esc(g.name)}" data-game-tag="${esc(g.tag)}">
            <span class="flow-game-tile flow-game-tile--${g.id}"></span>
            <span class="flow-game-meta">
              <span class="flow-game-name">${esc(g.name)}</span>
              <span class="flow-game-tag">${esc(g.tag)}</span>
            </span>
            ${draft.game === g.id ? `<span class="flow-check">${icon("check", 14)}</span>` : ""}
          </button>`
        )
        .join("")}
    </div>
    ${games.length ? "" : `<div class="empty-state"><strong>没有找到这个游戏</strong><span>换个关键词试试</span></div>`}
  `;
}

function activityStep(draft) {
  const game = gameById(draft.game);
  const flow = flowFor(draft.game);
  const modes = game.modes || [];
  const pos = draft.activityPos || "mode";
  const mode = draft.mode || "";

  if (pos === "modpack") {
    const opts = flow.modpackOptions || [];
    return question(
      "想玩哪个整合包？",
      `<div class="flow-choice-grid flow-choice-grid--3">
        ${opts
          .map(
            (o) =>
              `<button type="button" class="flow-choice ${draft.modpack === o ? "flow-choice--on" : ""}" data-action="wizard-modpack" data-value="${esc(o)}">${esc(o)}</button>`
          )
          .join("")}
      </div>
      <div class="field" style="margin-top:14px;max-width:340px">
        <label class="label" for="modpack-custom">其他整合包</label>
        <input class="input" id="modpack-custom" data-flow-modpack-custom placeholder="直接输入名字" value="${esc(draft.modpackCustom || "")}" />
      </div>
      <div style="margin-top:14px">
        ${button({ label: "下一步", action: "wizard-next-activity", kind: "primary", iconName: "chevronRight" })}
      </div>`
    );
  }

  if (pos === "rank") {
    const opts = flow.rankOptions || [];
    return question(
      "当前段位是？",
      `<div class="flow-choice-grid flow-choice-grid--3">
        ${opts
          .map(
            (o) =>
              `<button type="button" class="flow-choice ${draft.rank === o ? "flow-choice--on" : ""}" data-action="wizard-rank" data-value="${esc(o)}">${esc(o)}</button>`
          )
          .join("")}
      </div>`
    );
  }

  if (pos === "hero") {
    const opts = flow.heroOptions || [];
    return question(
      "常玩英雄？",
      `<div class="flow-tag-cloud">
        ${opts
          .map(
            (o) =>
              `<button type="button" class="chip ${draft.hero === o ? "chip--on" : ""}" data-action="wizard-hero" data-value="${esc(o)}">${esc(o)}</button>`
          )
          .join("")}
      </div>
      <div style="margin-top:14px">${button({ label: "跳过", action: "wizard-next-activity", kind: "ghost", iconName: "chevronRight" })}</div>`
    );
  }

  if (pos === "role") {
    const opts = flow.roleOptions || [];
    return question(
      "希望找什么位置？",
      `<div class="flow-choice-grid flow-choice-grid--2">
        ${opts
          .map(
            (o) =>
              `<button type="button" class="flow-choice ${draft.role === o ? "flow-choice--on" : ""}" data-action="wizard-role" data-value="${esc(o)}">${esc(o)}</button>`
          )
          .join("")}
      </div>
      <div style="margin-top:14px">${button({ label: "跳过", action: "wizard-next-activity", kind: "ghost", iconName: "chevronRight" })}</div>`
    );
  }

  const done = pos === "done";
  return question(
    "这次想怎么玩？",
    `<div class="flow-choice-grid flow-choice-grid--2">
      ${modes
        .map(
          (m) =>
            `<button type="button" class="flow-choice ${mode === m ? "flow-choice--on" : ""}" data-action="wizard-mode" data-value="${esc(m)}">${esc(m)}</button>`
        )
        .join("")}
    </div>
    ${done ? `<div style="margin-top:14px">${button({ label: "下一步", action: "wizard-next-activity", kind: "primary", iconName: "chevronRight" })}</div>` : ""}`
  );
}

function peopleStep(draft) {
  const flow = flowFor(draft.game);
  const tags = flow.peopleTags || [];
  const selected = draft.selectedTags || [];
  return question(
    "想和什么样的人一起玩？",
    `<div class="flow-tag-cloud">
      ${tags
        .map(
          (t) =>
            `<button type="button" class="chip ${selected.includes(t) ? "chip--on" : ""}" data-action="wizard-tag" data-value="${esc(t)}">${esc(t)}</button>`
        )
        .join("")}
    </div>
    <div class="inline-actions" style="margin-top:16px">
      ${button({ label: "下一步", action: "wizard-next-people", kind: "primary", iconName: "chevronRight" })}
      ${button({ label: "我不在意，让系统帮我找", action: "wizard-skip-tags", kind: "ghost", iconName: "link2" })}
    </div>`
  );
}

function timeStep(draft) {
  const options = [
    { value: "现在就玩", icon: "zap", note: "立即进入匹配池" },
    { value: "30分钟后", icon: "timer", note: "稍后加入" },
    { value: "晚些时候", icon: "clock", note: "约好再玩" },
  ];
  return question(
    "什么时候玩？",
    `<div class="flow-choice-grid flow-choice-grid--3">
      ${options
        .map(
          (o) =>
            `<button type="button" class="flow-choice ${draft.time === o.value ? "flow-choice--on" : ""}" data-action="wizard-time" data-value="${esc(o.value)}">
              <span class="flow-choice-icon">${icon(o.icon, 18)}</span>
              <span class="flow-choice-label">${esc(o.value)}</span>
              <span class="flow-choice-note">${esc(o.note)}</span>
            </button>`
        )
        .join("")}
    </div>`
  );
}

function teamStep(draft) {
  const options = ["1人", "2人", "3人", "4人+"];
  const pos = draft.teamPos || "current";
  if (pos === "needed") {
    return question(
      "还需要几个人？",
      `<div class="flow-choice-grid flow-choice-grid--4">
        ${options.map((o) => `<button type="button" class="flow-choice" data-action="wizard-needed" data-value="${esc(o)}">${esc(o)}</button>`).join("")}
      </div>`
    );
  }
  return question(
    "现在有几个人？",
    `<div class="flow-choice-grid flow-choice-grid--4">
      ${options.map((o) => `<button type="button" class="flow-choice" data-action="wizard-current" data-value="${esc(o)}">${esc(o)}</button>`).join("")}
    </div>`
  );
}

function detailsStep(draft) {
  const voices = ["需要", "不需要", "都可以"];
  const durations = [
    { label: "1小时", value: "60" },
    { label: "2小时", value: "120" },
    { label: "3小时+", value: "180" },
    { label: "不确定", value: "不限" },
  ];
  const styles = ["认真", "轻松", "随意"];
  return question(
    "还有什么要求？",
    `<div class="flow-details">
      <div class="field">
        <span class="label">语音</span>
        <div class="chip-group">
          ${voices.map((v) => `<button type="button" class="chip ${draft.voicePref === v ? "chip--on" : ""}" data-action="wizard-voice" data-value="${esc(v)}">${esc(v)}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <span class="label">游玩时长</span>
        <div class="chip-group">
          ${durations.map((d) => `<button type="button" class="chip ${draft.duration === d.value ? "chip--on" : ""}" data-action="wizard-duration" data-value="${d.value}">${d.label}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <span class="label">游戏风格</span>
        <div class="chip-group">
          ${styles.map((s) => `<button type="button" class="chip ${draft.style === s ? "chip--on" : ""}" data-action="wizard-style" data-value="${esc(s)}">${esc(s)}</button>`).join("")}
        </div>
      </div>
    </div>
    <div style="margin-top:18px">${button({ label: "下一步", action: "wizard-next-details", kind: "primary", iconName: "chevronRight" })}</div>`
  );
}

export function confirmSummary(draft) {
  const game = gameById(draft.game);
  const extra = [];
  if (draft.modpack) extra.push(`整合包 ${draft.modpack}`);
  if (draft.rank) extra.push(`段位 ${draft.rank}`);
  if (draft.hero) extra.push(`英雄 ${draft.hero}`);
  if (draft.role) extra.push(`位置 ${draft.role}`);
  const playerType = computePlayerType(draft);
  const lines = [
    `<div class="need-line"><strong>${esc(game.name)}</strong><span>${esc(draft.mode || "未选择玩法")}</span></div>`,
    `<div class="need-line"><span>${icon("target", 14)}</span><span>${esc(draft.goal || "这一局的目标")}</span></div>`,
  ];
  if (extra.length) {
    lines.push(`<div class="need-line"><span>${icon("badgeCheck", 14)}</span><span>${esc(extra.join(" · "))}</span></div>`);
  }
  lines.push(
    `<div class="need-line"><span>${icon("users", 14)} 你 ${esc(countLabel(draft.current || 1))} → 再找 ${esc(countLabel(draft.needed || 1))}</span></div>`,
    `<div class="need-line"><span>${icon("clock", 14)} ${esc(draft.time || "现在就玩")}</span><span>${icon("timer", 14)} ${esc(durationLabel(draft.duration))}</span><span>${draft.voice ? icon("mic", 14) + " 开麦" : icon("volumeX", 14) + " 闭麦"}</span></div>`
  );
  if (playerType) {
    lines.push(`<div class="need-line"><span>${icon("footprints", 14)}</span><span>${esc(playerType)}</span></div>`);
  }
  return `<div class="need-block home-filter-confirm-summary">${lines.join("")}</div>`;
}

export function needPage(state, draft) {
  const step = draft.wizardStep || "game";
  let content = gameStep(draft);
  switch (step) {
    case "activity":
      content = activityStep(draft);
      break;
    case "people":
      content = peopleStep(draft);
      break;
    case "time":
      content = timeStep(draft);
      break;
    case "team":
      content = teamStep(draft);
      break;
    case "details":
      content = detailsStep(draft);
      break;
    case "confirm":
      content = `<div class="flow-confirm">
        ${confirmSummary(draft)}
        <div class="flow-confirm-actions">
          ${button({ label: "开始匹配", action: "start-match", kind: "primary", size: "lg", iconName: "zap", extra: "btn--block" })}
        </div>
      </div>`;
      break;
    default:
      content = gameStep(draft);
  }
  const footer = `<div class="flow-footer">${button({ label: step === "game" ? "返回首页" : "上一步", action: step === "game" ? "go-home" : "wizard-back", kind: "ghost", iconName: "chevronLeft" })}</div>`;

  return homeShell(
    state,
    `<div class="prism-page prism-flow">
      <div class="prism-head">
        <div>
          <div class="prism-eyebrow"><i></i>开始匹配 · 快速构建需求</div>
          <h1 class="prism-title">${TITLES[step] || "开始匹配"}</h1>
          <p class="prism-sub">${SUBS[step] || ""}</p>
        </div>
        ${button({ label: "取消", action: "go-home", kind: "ghost", size: "sm", iconName: "x" })}
      </div>
      ${progress(step)}
      <div class="prism-card prism-flow-card">
        <div class="flow-body">${content}</div>
        ${footer}
      </div>
    </div>`,
    "home"
  );
}
