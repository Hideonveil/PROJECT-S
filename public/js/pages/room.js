import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, needSummary, shell, statusPill } from "../ui.js";

export function roomPage(state) {
  const room = state.room;
  const me = state.user;
  const partner = room.partner;
  const players = [
    { ...me, host: true, ready: true },
    { ...partner, host: false, ready: room.status !== "connecting" },
  ];
  const memberRows = players
    .map(
      (p) => `<div class="room-member ${p.host ? "room-member--host" : ""}">
        ${avatarWrap(p.avatarKey, 52, p.online !== false)}
        <div class="room-member-info">
          <div class="room-member-name">${esc(p.name)} ${p.host ? '<span class="mono" style="color:var(--signal);font-size:10px">HOST</span>' : ""}</div>
          <div class="room-member-meta">${esc(p.device)} · ${p.role || esc(partner.need.playerType || "待确认")}</div>
        </div>
        ${p.ready ? statusPill("READY") : statusPill("MATCHING")}
      </div>`
    )
    .join("");

  const actionArea =
    room.status === "connecting"
      ? `<div class="card" style="display:flex;align-items:center;justify-content:center;gap:10px;color:var(--signal)">${icon("refreshCw", 18)} 正在握手，确认双方需求一致…</div>`
      : room.status === "ready"
        ? `<div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="section-head"><h2 class="section-title">准备好了吗</h2><span class="section-note">房间是临时的，只服务这一局</span></div>
            ${button({ label: "开始游戏", action: "start-game", kind: "primary", size: "lg", iconName: "play", extra: "btn--block" })}
          </div>`
        : `<div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="room-timer">${icon("timer", 18)}<span id="room-timer">00:00</span><span class="muted">对局中</span></div>
            ${button({ label: "结束游戏", action: "finish-game", kind: "outline", size: "lg", iconName: "flag", extra: "btn--block" })}
          </div>`;

  return shell(
    state,
    "room",
    `<div class="room-page">
      <div class="room-panel">
        <div class="room-head">
          <div>
            <div class="page-eyebrow">${icon("link2", 13)} 临时游戏房间</div>
            <div class="room-code">${icon("copy", 16)} ${esc(room.code)}</div>
          </div>
          ${statusPill(room.status === "playing" ? "PLAYING" : room.status === "ready" ? "READY" : "MATCHING")}
        </div>
        ${needSummary(state.need, { compact: true })}
        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="section-head"><h2 class="section-title">成员</h2><span class="section-note">${players.length}/${esc(state.need.target)}</span></div>
          <div class="room-members">${memberRows}</div>
          ${
            partner.kind === "team"
              ? `<p class="muted" style="font-size:12px">队伍其他成员将在开始时同步进入，队长已确认你的申请。</p>`
              : ""
          }
        </div>
        ${actionArea}
      </div>
    </div>`,
    { immersive: true, topRight: room.status === "playing" ? "" : button({ label: "离开", action: "leave-room", kind: "ghost", size: "sm", iconName: "logOut" }) }
  );
}
