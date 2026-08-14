import { button, fragments, shell, statusPill } from "../ui.js";

export function homePage(state) {
  const pool = Math.max(0, state.match.pool ?? 0);
  return shell(
    state,
    "home",
    `<div class="page">
      <section class="home-hero">
        <div class="node-field-wrap"><canvas data-node-field></canvas></div>
        ${fragments()}
        <div class="home-hero-copy">
          <div class="page-eyebrow">${statusPill("LIVE")} <span>${pool} players searching now</span></div>
          <h1 class="home-hero-title">现在想怎么玩？</h1>
          <p class="home-hero-sub">找到此刻也想一起玩的人。选择游戏，告诉系统你的需求，剩下的交给匹配池。</p>
          <div class="home-hero-actions">
            ${button({ label: "开始匹配", action: "go-need", kind: "primary", size: "lg", iconName: "gamepad2" })}
            ${button({ label: "匹配筛选", action: "go-need", kind: "outline", size: "lg", iconName: "slidersHorizontal" })}
          </div>
        </div>
      </section>
    </div>`,
    { topRight: `${statusPill("LIVE")}` }
  );
}