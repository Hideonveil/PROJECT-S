import { icon } from "../icons.js";
import { button, esc, shell } from "../ui.js";
import { GAMES } from "../data.js";

export function needPage(state, draft) {
  const game = GAMES.find((g) => g.id === draft.game) || GAMES[0];
  const durations = ["30", "60", "90", "120"];

  return shell(
    state,
    "home",
    `<div class="page">
      <div class="page-head">
        <div class="page-eyebrow">${icon("radio", 13)} 开始匹配 · 第一步</div>
        <h1 class="page-title">此刻，你想怎么玩？</h1>
        <p class="page-sub">只描述这一局的需求。NODE 按这个需求去找，不按人脉猜。</p>
      </div>
      <form class="card card--pad-lg need-form" data-form="need">
        <div class="field">
          <span class="label">游戏</span>
          <div class="chip-group">
            ${GAMES.map(
              (g) =>
                `<button type="button" class="chip ${draft.game === g.id ? "chip--on" : ""}" data-action="need-option" data-key="game" data-value="${g.id}">${esc(
                  g.name
                )}<span class="mono" style="color:var(--muted);font-size:10px">${g.tag}</span></button>`
            ).join("")}
          </div>
        </div>

        <div class="field">
          <span class="label">玩法 / 活动</span>
          <div class="chip-group">
            ${game.modes.map((m) => `<button type="button" class="chip ${draft.mode === m ? "chip--on" : ""}" data-action="need-option" data-key="mode" data-value="${esc(m)}">${esc(m)}</button>`).join("")}
          </div>
        </div>

        <div class="form-grid">
          <div class="field span-2">
            <label class="label" for="goal">游戏目标 <span class="label-note">这一局你想达成什么</span></label>
            <input class="input" id="goal" name="goal" data-binding="goal" value="${esc(draft.goal)}" placeholder="例如：清完本周远征奖励" />
          </div>

          <div class="field">
            <span class="label">当前人数 / 希望人数</span>
            <div class="stepper">
              <button type="button" data-action="step-value" data-key="current" data-delta="-1">−</button>
              <span class="stepper-value" id="current-count">${draft.current}</span>
              <button type="button" data-action="step-value" data-key="current" data-delta="1">+</button>
              <span class="stepper-value" style="color:var(--muted)">/</span>
              <span class="stepper-value" id="target-count">${draft.target}</span>
              <button type="button" data-action="step-value" data-key="target" data-delta="1">+</button>
              <button type="button" data-action="step-value" data-key="target" data-delta="-1">−</button>
            </div>
          </div>

          <div class="field">
            <span class="label">预计游玩时间</span>
            <input class="input" type="time" name="time" data-binding="time" value="${esc(draft.time)}" />
          </div>

          <div class="field">
            <span class="label">游玩时长</span>
            <div class="chip-group">
              ${durations.map((d) => `<button type="button" class="chip ${draft.duration === d ? "chip--on" : ""}" data-action="need-option" data-key="duration" data-value="${d}">${d} 分钟</button>`).join("")}
            </div>
          </div>

          <div class="field">
            <span class="label">语音</span>
            <label class="toggle">
              <input type="checkbox" data-binding="voice" ${draft.voice ? "checked" : ""} />
              <span class="toggle-track"></span>
              <span>${draft.voice ? "开麦沟通" : "闭麦游玩"}</span>
            </label>
          </div>

          <div class="field span-2">
            <label class="label" for="playerType">希望寻找的玩家类型 <span class="label-note">写给匹配算法和对方</span></label>
            <input class="input" id="playerType" name="playerType" data-binding="playerType" value="${esc(draft.playerType)}" placeholder="例如：稳定输出，认真打完" />
          </div>
        </div>

        <div class="form-actions">
          ${button({ label: "进入匹配池", action: "start-match", kind: "primary", size: "lg", iconName: "zap", extra: "btn--block" })}
          ${button({ label: "返回首页", action: "go-home", kind: "ghost", iconName: "arrowRight" })}
        </div>
      </form>
    </div>`,
    { topRight: button({ label: "保存并匹配", action: "start-match", kind: "primary", size: "sm", iconName: "zap" }) }
  );
}
