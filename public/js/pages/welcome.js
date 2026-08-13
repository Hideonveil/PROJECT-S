import { icon } from "../icons.js";
import { avatar } from "../avatar.js";
import { brand, button, esc, statusPill } from "../ui.js";
import { DEVICES, GAMES } from "../data.js";

export function welcomeHero(state) {
  return `<section class="welcome-left">
    <div class="node-field-wrap"><canvas data-node-field></canvas></div>
    <div class="welcome-copy">
      ${brand(46)}
      <div>
        <h1 class="welcome-title">此刻想怎么玩，<br /><span class="accent">就此刻找到人。</span></h1>
        <p class="welcome-sub">NODE 不做大厅，只做一件事：把此刻正在找游戏伙伴的玩家和队伍连在一起。</p>
      </div>
      <div class="welcome-proof">
        <span class="reason-tag reason-tag--neutral">${icon("zap", 13)} 实时匹配池</span>
        <span class="reason-tag reason-tag--neutral">${icon("users", 13)} 玩家与队伍</span>
        <span class="reason-tag reason-tag--neutral">${icon("link2", 13)} 一局后再决定连接</span>
      </div>
    </div>
    <div class="live-strip">
      ${statusPill("LIVE")}
      <span class="live-count">${Math.max(0, state.match.pool ?? 0)} 个节点正在寻找</span>
    </div>
  </section>`;
}

export function welcomePage(state, draft) {
  const selectedGames = draft.games || [];
  const genderOptions = ["男", "女", "保密"];
  return `<div class="welcome">
    ${welcomeHero(state)}
    <section class="welcome-right">
      <form class="welcome-form" data-form="onboard">
        <div class="card card--pad-lg" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <h2 class="card-title">创建游戏身份</h2>
            <p class="page-sub" style="font-size:13px">30 秒完成，之后的每次匹配都用这份身份。</p>
          </div>
          <div class="field">
            <label class="label" for="nickname">昵称</label>
            <input class="input" id="nickname" name="nickname" value="${esc(draft.nickname)}" placeholder="队友会这样称呼你" maxlength="12" />
          </div>
          <div class="field">
            <span class="label">头像</span>
            <div class="avatar-pick" data-avatar-pick>
              ${[1, 2, 3, 4]
                .map(
                  (i) =>
                    `<button type="button" class="${draft.avatarKey === `me-${i}` ? "button--on" : ""}" data-action="pick-avatar" data-value="me-${i}" aria-label="头像 ${i}">${avatar(
                      `me-${i}`,
                      96
                    )}</button>`
                )
                .join("")}
              <button type="button" class="avatar-upload-tile ${String(draft.avatarKey).startsWith("data:") ? "button--on" : ""}" data-action="choose-avatar-file" aria-label="上传自定义头像">
                <span data-avatar-preview>${String(draft.avatarKey).startsWith("data:") ? avatar(draft.avatarKey, 72) : icon("camera", 18)}</span>
                <span>${String(draft.avatarKey).startsWith("data:") ? "更换" : "上传"}</span>
              </button>
              <input type="file" accept="image/*" data-avatar-file hidden />
            </div>
          </div>
          <div class="field">
            <label class="label" for="device">设备</label>
            <select class="select" id="device" name="device" data-binding="device">
              ${DEVICES.map((d) => `<option ${draft.device === d ? "selected" : ""}>${d}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <span class="label">性别 <span class="label-note">可选</span></span>
            <div class="chip-group" data-chip-group="gender">
              ${genderOptions
                .map(
                  (g) =>
                    `<button type="button" class="chip ${draft.gender === g ? "chip--on" : ""}" data-action="pick-gender" data-value="${g}">${g}</button>`
                )
                .join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">常玩游戏 <span class="label-note">至少选一个</span></span>
            <div class="chip-group" data-chip-group="games">
              ${GAMES.map(
                (g) =>
                  `<button type="button" class="chip ${selectedGames.includes(g.id) ? "chip--on" : ""}" data-action="toggle-game" data-value="${g.id}">${esc(
                    g.name
                  )}<span class="mono" style="color:var(--muted);font-size:10px">${g.tag}</span></button>`
              ).join("")}
            </div>
          </div>
          <div class="field">
            <label class="label" for="playStyle">一句话介绍打法</label>
            <input class="input" id="playStyle" name="playStyle" value="${esc(draft.playStyle)}" placeholder="例如：稳定沟通，不摆烂" />
          </div>
          ${button({
            label: "进入 NODE",
            action: "complete-onboard",
            kind: "primary",
            size: "lg",
            iconName: "arrowRight",
            extra: "btn--block",
          })}
        </div>
      </form>
    </section>
  </div>`;
}