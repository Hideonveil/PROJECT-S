import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, needSummary, shell, statusPill } from "../ui.js";
import { GAME_BY_ID } from "../data.js";

export function homePage(state) {
  const need = state.need;
  const game = GAME_BY_ID[need.game] || { name: need.game };
  const pool = Math.max(0, state.match.pool ?? 0);
  const history = state.history || [];
  const live = state.friends || [];

  return shell(
    state,
    "home",
    `<div class="page">
      <section class="home-hero">
        <div class="node-field-wrap"><canvas data-node-field></canvas></div>
        <div class="home-hero-copy">
          <div class="page-eyebrow">${statusPill("LIVE")} <span>${pool} 个节点正在寻找</span></div>
          <h1 class="home-hero-title">现在想怎么玩？<br /><span class="accent">现在就有人等你。</span></h1>
          <p class="home-hero-sub">告诉 NODE 此刻的需求，它会从正在匹配的玩家与队伍里挑出最合适的几个，你来决定和谁一起。</p>
          <div class="home-hero-actions">
            ${button({ label: "开始匹配", action: "go-need", kind: "primary", size: "lg", iconName: "gamepad2" })}
            ${button({ label: "填写当前需求", action: "go-need", kind: "outline", size: "lg", iconName: "slidersHorizontal" })}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">现在想怎么玩</h2>
          <span class="section-note">当前需求 · 随时可改</span>
        </div>
        <div class="grid-2">
          ${needSummary(need)}
          <div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="card-title">快速开始</div>
            <div class="quick-start">
              <button data-action="quick-need" data-value="valorant">${icon("swords", 18)}<span>无畏契约 · 排位赛</span></button>
              <button data-action="quick-need" data-value="minecraft">${icon("dices", 18)}<span>我的世界 · 模组生存</span></button>
              <button data-action="quick-need" data-value="pubg">${icon("target", 18)}<span>PUBG · 四排</span></button>
              <button data-action="quick-need" data-value="hok">${icon("gamepad2", 18)}<span>王者荣耀 · 排位</span></button>
              <button data-action="go-need">${icon("slidersHorizontal", 18)}<span>自定义需求</span></button>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">此刻在线</h2>
          <span class="section-note">Live 节点</span>
        </div>
        <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div class="live-strip">
            <div class="live-avatars">
              ${live.length
                ? live.slice(0, 4).map((f) => avatarWrap(f.avatarKey, 42, f.online)).join("")
                : `<span class="live-avatars-empty">${icon("radio", 20)}</span>`}
            </div>
            <span class="live-count">${pool} 人在匹配池 · ${game.name}</span>
          </div>
          ${button({ label: "进入匹配池", action: "go-need", kind: "ghost", iconName: "arrowRight" })}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">最近连接</h2>
          <span class="section-note">只保留玩过的人</span>
        </div>
        ${
          history.length === 0
            ? `<div class="empty-state"><strong>还没有一起玩过的人</strong><span>完成一次匹配并双向选择再连接，就会出现在这里。</span></div>`
            : `<div class="history-list">${history
                .slice(0, 3)
                .map(
                  (h) => `<div class="history-row">
                    <div class="history-main"><span class="history-title">${esc(h.title)}</span><span class="history-sub">${esc(h.partnerName)} · ${esc(h.time)}</span></div>
                    <span class="history-result">${esc(h.result)}</span>
                  </div>`
                )
                .join("")}</div>`
        }
      </section>
    </div>`,
    { topRight: `${statusPill("LIVE")}` }
  );
}
