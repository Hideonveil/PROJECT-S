import { icon } from "../icons.js";
import { avatar } from "../avatar.js";
import { esc, homeShell, registrationStepper } from "../ui.js";
import { DEVICES, GENRES } from "../data.js";

const IDENTITY_STEPS = ["昵称", "头像", "设备", "游戏类型", "性别"];
const GENDERS = ["男", "女", "保密", "其他"];

function futureArtChoice({ action, key = "", value, label, selected, multiple = false }) {
  return `<button type="button" class="identity-choice ${selected ? "is-on" : ""}" data-action="${action}" ${key ? `data-key="${key}"` : ""} data-value="${esc(value)}" aria-pressed="${selected}">
    <span class="identity-art-slot" aria-hidden="true"><i>IMAGE SLOT</i></span>
    <span class="identity-choice-label"><b>${esc(label)}</b>${multiple ? `<small>${selected ? "已选择" : "可多选"}</small>` : ""}</span>
  </button>`;
}

function stepContent(step, draft) {
  if (step === 0) {
    return `<label class="identity-field identity-field--hero" for="nickname"><span>玩家昵称</span><input id="nickname" name="nickname" value="${esc(draft.nickname)}" placeholder="队友会这样称呼你" maxlength="12" autofocus /><small>最多 12 个字，以后可以修改。</small></label>`;
  }

  if (step === 1) {
    const hasUpload = String(draft.avatarKey || "").startsWith("data:");
    return `<div class="identity-avatar-options" data-avatar-pick>
      <button type="button" class="identity-choice identity-choice--avatar ${!draft.avatarKey ? "is-on" : ""}" data-action="pick-avatar" data-value="" aria-pressed="${!draft.avatarKey}">
        <span class="identity-art-slot identity-art-slot--avatar" aria-hidden="true"><i>NO IMAGE</i></span><span class="identity-choice-label"><b>暂不设置头像</b><small>保持空白</small></span>
      </button>
      <button type="button" class="identity-choice identity-choice--avatar identity-upload ${hasUpload ? "is-on" : ""}" data-action="choose-avatar-file" aria-pressed="${hasUpload}">
        <span class="identity-art-slot identity-art-slot--avatar" data-avatar-preview>${hasUpload ? avatar(draft.avatarKey, 126) : `<i>UPLOAD IMAGE</i>`}</span><span class="identity-choice-label"><b>上传自己的头像</b><small>JPG / PNG</small></span>
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

  return `<div class="identity-choice-grid identity-choice-grid--four" data-identity-choice-group="gender">${GENDERS.map((gender) =>
    futureArtChoice({ action: "onboard-choice", key: "gender", value: gender, label: gender, selected: draft.gender === gender }),
  ).join("")}</div>`;
}

export function welcomePage(state, draft) {
  const step = Math.max(0, Math.min(IDENTITY_STEPS.length - 1, Number(draft.onboardStep) || 0));
  const titles = ["先给队友一个称呼。", "头像由你决定。", "你通常在哪里玩？", "你喜欢什么类型？", "最后一个基础信息。"];
  const descriptions = [
    "昵称是匹配成功后，对方最先看到的信息。",
    "不再提供预制头像。你可以保持空白，也可以上传自己的图片。",
    "这里只记录常用设备，选项图片之后再补充。",
    "可以选择多个类型；图片位置已经预留。",
    "性别只用于完善玩家身份，不参与匹配排序。",
  ];

  return homeShell(
    state,
    `<section class="identity-workspace">
      ${registrationStepper(step + 1, IDENTITY_STEPS)}
      <header class="identity-head"><div><div class="match-eyebrow">PLAYER IDENTITY / ${String(step + 1).padStart(2, "0")} OF 05</div><h1>创建玩家身份</h1></div><p>一次只完成一件事。<br />所有信息以后都可以修改。</p></header>
      <form class="identity-form identity-form--step" data-form="onboard" data-onboard-step="${step}">
        <section class="identity-step-card">
          <div class="identity-step-copy"><span>${String(step + 1).padStart(2, "0")} / 05</span><h2>${titles[step]}</h2><p>${descriptions[step]}</p></div>
          <div class="identity-step-body">${stepContent(step, draft)}</div>
          <footer class="identity-step-actions">
            ${step > 0 ? `<button type="button" class="identity-back" data-action="onboard-back">${icon("arrowRight", 18)}<span>上一步</span></button>` : `<span></span>`}
            <button type="button" class="identity-submit" data-action="${step === IDENTITY_STEPS.length - 1 ? "complete-onboard" : "onboard-next"}"><span>${step === IDENTITY_STEPS.length - 1 ? "完成并进入 PROJECT-S" : "下一步"}</span>${icon("arrowRight", 22)}</button>
          </footer>
        </section>
      </form>
    </section>`,
    "onboard",
  );
}
