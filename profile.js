import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, needSummary, shell, statusPill } from "../ui.js";


export function profilePage(state, candidate) {
  const pending = state.match.pending === candidate.id;
  const genres = candidate.genres || [];
  const genreTags = genres.length
    ? `<div class="chip-group">${genres.map((g) => `<span class="chip chip--on">${esc(g)}</span>`).join("")}</div>`
    : `<span class="dim" style="font-size:13px">未填写常玩游戏类型</span>`;

  const compat = (candidate.compat || [])
    .map(
      (c) => `<div class="kv-row">
        <div class="kv-label">${icon("link2", 14)}${esc(c.label)}</div>
        <div class="kv-value">${esc(c.score)}% · ${esc(c.text)}</div>
      </div>`
    )
    .join("");

  return shell(
    state,
    "home",
    `<div class="page">
      <div class="page-head">
        <div class="page-eyebrow"><a href="#/results" class="inline-link" style="color:var(--signal)">${icon("chevronLeft", 14)} 返回匹配结果</a></div>
      </div>
      <section class="profile-hero">
        <div class="card card--pad-lg">
          <div class="profile-identity">
            ${avatarWrap(candidate.avatarKey, 104, candidate.online)}
            <div style="min-width:0">
              <div class="player-card-kind">${candidate.kind === "team" ? "队伍 · " : "玩家 · "}${esc(candidate.device)}</div>
              <div class="profile-name"><h1>${esc(candidate.name)}</h1>${candidate.online ? statusPill("LIVE") : statusPill("OFFLINE")}</div>
              <div class="profile-handle">${esc(candidate.handle)}</div>
            </div>
          </div>
          <div class="profile-meta">
            <span class="reason-tag reason-tag--neutral">${icon("monitor", 13)} ${esc(candidate.device)}</span>
            <span class="reason-tag reason-tag--neutral">${candidate.need.voice ? icon("mic", 13) + " 开麦" : icon("volumeX", 13) + " 闭麦"}</span>
            <span class="reason-tag reason-tag--neutral">${icon("shieldCheck", 13)} 基础身份已验证</span>
          </div>
          <p class="profile-bio">${esc(candidate.playStyle || "正在等待这一局。")}</p>
        </div>
        <div class="card card--pad-lg" style="display:flex;flex-direction:column;gap:14px">
          ${needSummary(candidate.need)}
          ${pending
            ? `<div class="inline-actions">${statusPill("CONNECTED")}<span class="dim" style="font-size:13px">申请已发送，对方已接受</span></div>`
            : button({ label: candidate.kind === "team" ? "申请加入队伍" : "申请一起玩", action: "apply-partner", value: candidate.id, kind: "primary", size: "lg", iconName: "send" })}
        </div>
      </section>
      <section class="grid-2">
        <div class="card">
          <div class="card-title" style="margin-bottom:10px">为什么适合一起玩</div>
          <div>${compat}</div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:4px">常玩游戏类型</div>
          ${genreTags}
          <hr class="divider" />
          <div class="kv-row">
            <div class="kv-label">${icon("activity", 14)}打法风格</div>
            <div class="kv-value">${esc(candidate.playStyle || "待补充")}</div>
          </div>
          <div class="kv-row">
            <div class="kv-label">${icon("mic", 14)}语音</div>
            <div class="kv-value">${candidate.need.voice ? "开麦" : "闭麦"}</div>
          </div>
        </div>
      </section>
    </div>`
  );
}
