import { icon } from "../icons.js";
import { button, shell, statusPill } from "../ui.js";

export function homePage(state) {
  const pool = Math.max(0, state.match.pool ?? 0);
  return shell(
    state,
    "home",
    `<div class="page">
      <section class="home-hero">
        <div class="node-field-wrap"><canvas data-node-field></canvas></div>
        <div class="home-hero-copy">
          <div class="page-eyebrow">${statusPill("LIVE")} <span>${pool} 人正在匹配中</span></div>
          <h1 class="home-hero-title">现在想怎么玩？<br /><span class="accent">现在就有人等你。</span></h1>
          <div class="home-hero-actions">
            ${button({ label: "开始匹配", action: "start-match", kind: "primary", size: "lg", iconName: "gamepad2" })}
            ${button({ label: "匹配筛选", action: "go-need", kind: "outline", size: "lg", iconName: "slidersHorizontal" })}
          </div>
        </div>
      </section>
    </div>`,
    { topRight: `${statusPill("LIVE")}` }
  );
}
