import { icon } from "../icons.js";
import { esc, homeShell, registrationStepper } from "../ui.js";
import { DEVICES, GENRES } from "../data.js";

const IDENTITY_STEPS = ["昵称", "头像", "设备", "游戏类型"];
const GENDERS = ["男", "女", "保密", "其他"];

function futureArtChoice({ action, key = "", value, label, selected, multiple = false }) {
  return `<button type="button" class="identity-choice identity-choice--text ${selected ? "is-on" : ""}" data-action="${action}" ${key ? `data-key="${key}"` : ""} data-value="${esc(value)}" aria-pressed="${selected}">
    <span class="identity-choice-label"><b>${esc(label)}</b></span>
  </button>`;
}

function stepContent(step, draft) {
  if (step === 0) {
    return `<label class="identity-field identity-field--hero" for="nickname"><span>玩家昵称</span><input id="nickname" name="nickname" value="${esc(draft.nickname)}" placeholder="队友会这样称呼你" maxlength="12" autofocus /></label>`;
  }

  if (step === 1) {
    const hasUpload = String(draft.avatarKey || "").startsWith("data:");
    return `<div class="identity-avatar-options" data-avatar-pick>
      <button type="button" class="identity-choice identity-choice--avatar identity-choice--text identity-upload ${hasUpload ? "is-on" : ""}" data-action="choose-avatar-file" aria-pressed="${hasUpload}">
        <span class="identity-choice-label"><b>${hasUpload ? "更换头像" : "选择头像"}</b></span>
      </button>
      <button type="button" class="identity-choice identity-choice--avatar identity-choice--text ${!hasUpload ? "is-on" : ""}" data-action="choose-avatar-none" aria-pressed="${!hasUpload}">
        <span class="identity-choice-label"><b>暂不设置头像</b></span>
      </button>
      <input type="file" accept="image/*" data-avatar-file hidden />
    </div>`;
  }

  if (step === 2) {
    return `<div class="identity-choice-grid identity-choice-grid--three" data-identity-choice-group="device">${DEVICES.map((device) =>
      futureArtChoice({ action: "onboard-choice", key: "device", value: device, label: device, selected: draft.device === device }),
    ).join("")}</div>`;
  }

  if (step === 3) {
    const selected = draft.genres || [];
    return `<div class="identity-choice-grid identity-choice-grid--genres" data-chip-group="genres">${GENRES.map((genre) =>
      futureArtChoice({ action: "toggle-genre", value: genre, label: genre, selected: selected.includes(genre), multiple: true }),
    ).join("")}</div>`;
  }

  return `<div class="identity-gender-field">
    <p class="identity-matching-note" role="note"><span>匹配说明</span><b>目前版本会优先匹配同性玩家。</b></p>
    <div class="identity-choice-grid identity-choice-grid--four" data-identity-choice-group="gender">${GENDERS.map((gender) =>
      futureArtChoice({ action: "onboard-choice", key: "gender", value: gender, label: gender, selected: draft.gender === gender }),
    ).join("")}</div>
  </div>`;
}

export function welcomePage(state, draft) {
  const step = Math.max(0, Math.min(IDENTITY_STEPS.length - 1, Number(draft.onboardStep) || 0));
  const titles = ["给队友一个称呼", "头像由你决定", "常用设备", "喜欢的类型"];
  const stepCount = IDENTITY_STEPS.length;

  return homeShell(
    state,
    `<section class="identity-workspace">
      ${registrationStepper(step + 1, IDENTITY_STEPS)}
      <header class="identity-head"><div><div class="match-eyebrow">PLAYER IDENTITY / ${String(step + 1).padStart(2, "0")} OF ${String(stepCount).padStart(2, "0")}</div><h1>创建玩家身份</h1></div></header>
      <form class="identity-form identity-form--step ${draft.onboardDirection < 0 ? "is-backward" : "is-forward"}" data-form="onboard" data-onboard-step="${step}">
        <section class="identity-step-card">
          <div class="identity-step-copy"><span>${String(step + 1).padStart(2, "0")} / ${String(stepCount).padStart(2, "0")}</span><h2>${titles[step]}</h2></div>
          <div class="identity-step-body">${stepContent(step, draft)}</div>
          <footer class="identity-step-actions">
            ${step > 0 ? `<button type="button" class="identity-back" data-action="onboard-back">${icon("arrowRight", 18)}<span>上一步</span></button>` : `<span></span>`}
            <button type="button" class="identity-submit" data-action="${step === IDENTITY_STEPS.length - 1 ? "complete-onboard" : "onboard-next"}"><span>${step === IDENTITY_STEPS.length - 1 ? "完成并进入“机”缘" : "下一步"}</span>${icon("arrowRight", 22)}</button>
          </footer>
        </section>
      </form>
    </section>`,
    "onboard",
  );
}
