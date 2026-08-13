import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, shell, statusPill } from "../ui.js";

export function gameoverPage(state) {
  const session = state.session;
  const partner = session.partner;
  const outcomes = [
    { id: "win", label: "胜利", icon: "trophy" },
    { id: "draw", label: "平局", icon: "activity" },
    { id: "loss", label: "失利", icon: "flag" },
  ];

  return shell(
    state,
    "gameover",
    `<div class="gameover-page">
      <div class="gameover-panel">
        <div class="gameover-head">
          <div class="page-eyebrow">${icon("flag", 13)} 游戏结束 · 再决定连接</div>
          <h1 class="page-title">这一局结束了</h1>
          <p class="page-sub">第一次匹配不是永久好友。只有双方都想再玩，这段连接才会保留。</p>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="section-head"><h2 class="section-title">本局结果</h2><span class="section-note">记录在你的匹配历史里</span></div>
          <div class="outcome-grid">
            ${outcomes
              .map(
                (o) =>
                  `<button type="button" class="outcome-btn ${session.outcome === o.id ? "outcome-btn--on" : ""}" data-action="set-outcome" data-value="${o.id}">${icon(
                    o.icon,
                    22
                  )}<span>${o.label}</span></button>`
              )
              .join("")}
          </div>
          <div class="inline-actions" style="justify-content:space-between">
            <span class="dim" style="font-size:13px">${esc(partner.name)} · ${esc(partner.handle)}</span>
            ${statusPill("DONE")}
          </div>
        </div>

        <div class="card rematch-card">
          <div class="section-head"><h2 class="section-title">还想再一起玩吗？</h2><span class="section-note">双向选择</span></div>
          <div class="rematch-choices">
            ${button({ label: "再玩一局", action: "choose-rematch", value: "yes", kind: session.mine === "yes" ? "primary" : "outline", iconName: "refreshCw" })}
            ${button({ label: "到此为止", action: "choose-rematch", value: "no", kind: session.mine === "no" ? "danger" : "outline", iconName: "x" })}
          </div>
          <div class="kv-row" style="border:0;padding:0">
            <div class="kv-label">${icon("userCheck", 14)}对方意愿</div>
            <div class="kv-value">${session.theirs === null ? '<span class="muted">等待确认…</span>' : session.theirs === "yes" ? '<span class="mono" style="color:var(--signal)">愿意再玩</span>' : '<span class="mono" style="color:var(--danger)">暂不继续</span>'}</div>
          </div>
        </div>

        ${
          session.connected
            ? `<div class="card" style="border-color:var(--signal-border);background:var(--signal-soft);display:flex;flex-direction:column;gap:12px">
                <div class="inline-actions">${statusPill("CONNECTED")}<strong>双向选择成功，${esc(partner.name)} 已加入你的好友</strong></div>
                <div class="inline-actions">
                  ${button({ label: "再玩一局", action: "rematch", kind: "primary", iconName: "refreshCw" })}
                  ${button({ label: "查看好友", action: "go-friends", kind: "outline", iconName: "users" })}
                  ${button({ label: "回到首页", action: "go-home", kind: "ghost", iconName: "house" })}
                </div>
              </div>`
            : session.mine && session.theirs !== null
              ? `<div class="card" style="display:flex;flex-direction:column;gap:12px">
                  <p class="dim" style="font-size:13px">这段连接没有保留。没关系，下一局还有新的节点。</p>
                  <div class="inline-actions">
                    ${button({ label: "回到首页", action: "go-home", kind: "primary", iconName: "house" })}
                    ${button({ label: "再次匹配", action: "rematch", kind: "outline", iconName: "refreshCw" })}
                  </div>
                </div>`
              : ""
        }
      </div>
    </div>`,
    { immersive: true }
  );
}
