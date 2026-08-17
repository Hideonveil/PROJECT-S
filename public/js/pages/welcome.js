import { icon } from "../icons.js";
import { avatar } from "../avatar.js";
import { esc, homeShell } from "../ui.js";
import { DEVICES, GENRES } from "../data.js";

export function welcomePage(state, draft) {
  const selectedGenres = draft.genres || [];
  const genderOptions = ["男", "女", "保密", "其他"];

  return homeShell(
    state,
    `<section class="identity-workspace">
      <header class="identity-head"><div class="match-eyebrow">PLAYER IDENTITY / 30 SEC</div><h1>创建玩家身份</h1><p>只保留匹配真正需要的信息，以后都可以修改。</p></header>
      <form class="identity-form" data-form="onboard">
        <div class="identity-column">
          <label class="identity-field" for="nickname"><span>昵称</span><input id="nickname" name="nickname" value="${esc(draft.nickname)}" placeholder="队友会这样称呼你" maxlength="12" /></label>
          <div class="identity-field"><span>头像</span><div class="identity-avatars" data-avatar-pick>${[1, 2, 3, 4].map((i) => `<button type="button" class="${draft.avatarKey === `me-${i}` ? "is-on" : ""}" data-action="pick-avatar" data-value="me-${i}" aria-label="头像 ${i}">${avatar(`me-${i}`, 68)}</button>`).join("")}<button type="button" class="identity-upload ${String(draft.avatarKey).startsWith("data:") ? "is-on" : ""}" data-action="choose-avatar-file" aria-label="上传自定义头像"><span data-avatar-preview>${String(draft.avatarKey).startsWith("data:") ? avatar(draft.avatarKey, 54) : icon("pencil", 18)}</span><small>上传</small></button><input type="file" accept="image/*" data-avatar-file hidden /></div></div>
        </div>
        <div class="identity-column">
          <label class="identity-field" for="device"><span>设备</span><select id="device" name="device" data-binding="device">${DEVICES.map((d) => `<option ${draft.device === d ? "selected" : ""}>${d}</option>`).join("")}</select></label>
          <div class="identity-field"><span>性别 <small>可选</small></span><div class="identity-chips" data-chip-group="gender">${genderOptions.map((g) => `<button type="button" class="${draft.gender === g ? "is-on" : ""}" data-action="pick-gender" data-value="${g}">${g}</button>`).join("")}</div></div>
          <div class="identity-field"><span>常玩游戏类型 <small>至少选一个</small></span><div class="identity-chips" data-chip-group="genres">${GENRES.map((g) => `<button type="button" class="${selectedGenres.includes(g) ? "is-on" : ""}" data-action="toggle-genre" data-value="${g}">${esc(g)}</button>`).join("")}</div></div>
        </div>
        <button class="identity-submit" type="button" data-action="complete-onboard"><span>进入 PROJECT-S</span>${icon("arrowRight", 22)}</button>
      </form>
    </section>`,
    "onboard"
  );
}
