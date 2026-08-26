import { GAME_BY_ID } from "../data.js";
import { icon } from "../icons.js";
import { rankLabel } from "../ranks.js?v=20260821-rank-label-01";
import { esc, homeShell } from "../ui.js";

function queryPills(need) {
  const game = GAME_BY_ID[need.game]?.name || need.game || "Deadlock";
  const details = need.details || {};
  const values = [
    ["gamepad2", game],
    ["target", need.goal || need.mode || "匹配"],
    [need.voice ? "mic" : "volumeX", need.voice ? "开麦" : "不开麦"],
    ["clock", need.time || "现在"],
  ];
  if (details.role) values.splice(2, 0, ["circleDot", details.role]);
  if (matchingMode(need) === "casual") {
    const max = Math.max(1, Number(need.desiredTeammates || Number(need.target || 2) - 1) || 1);
    const min = Math.min(max, Math.max(1, Number(need.minTeammates || max) || max));
    values.splice(2, 0, ["users", min === max ? `找 ${max} 位队友` : `找 ${min}–${max} 位队友`]);
  }
  return values.map(([iconName, label]) => `<span>${icon(iconName, 15)}${esc(label)}</span>`).join("");
}

function matchingMode(need) {
  return need?.mode === "casual" || need?.goal === "娱乐" ? "casual" : "ranked";
}

function memberId(member) {
  return member?.userId || member?.user_id || member?.id || "";
}

function memberName(member, fallback = "候选玩家") {
  return member?.profile?.nickname || member?.nickname || member?.name || fallback;
}

function memberInitial(member) {
  return Array.from(memberName(member, "玩").trim() || "玩")[0] || "玩";
}

function memberRank(member, mode) {
  if ((member?.mode || mode) === "casual") return "休闲模式";
  return rankLabel(member?.rankCode || member?.rank_code, "段位待定");
}

function memberMicrophone(member, fallbackNeed) {
  const preference = member?.microphonePreference || member?.microphone_preference || fallbackNeed?.details?.voicePreference
    || (fallbackNeed?.voice === true ? "on" : fallbackNeed?.voice === false ? "off" : "any");
  return preference === "on" ? "开麦" : preference === "off" ? "不开麦" : "都可以";
}

function normalizedMembers(state, { group, candidate, awaiting }) {
  if (group) return Array.isArray(group.members) ? group.members : [];
  const members = [{
    userId: state.user.id,
    isOwner: true,
    profile: { nickname: state.user.nickname || "你" },
    rankCode: state.need?.details?.rank || null,
    microphonePreference: state.need?.details?.voicePreference || (state.need?.voice ? "on" : "off"),
    mode: matchingMode(state.need),
    decision: "accepted",
  }];
  if (awaiting && candidate) members.push({ userId: candidate.id, profile: candidate, decision: null });
  return members;
}

function matchingRosterMarkup(state, { group, candidate, awaiting, isWaiting, target }) {
  const mode = matchingMode(state.need);
  const allMembers = normalizedMembers(state, { group, candidate, awaiting });
  const self = allMembers.find((member) => memberId(member) === state.user.id) || allMembers[0];
  const teammates = allMembers.filter((member) => member !== self && member.decision !== "rejected");
  const shouldShowPlaceholder = mode === "casual" ? teammates.length < target : teammates.length === 0;
  const row = (member, mine = false) => {
    const ready = member.decision === "accepted" || mine;
    const status = mine ? "你 · 已进入匹配" : ready ? "已加入" : awaiting ? "正在连接" : isWaiting ? "等待确认" : "正在匹配";
    const rank = memberRank(member, mode);
    const microphone = memberMicrophone(member, mine ? state.need : null);
    return `<li class="matching-roster-member ${ready ? "is-ready" : ""}">
      <span class="matching-roster-avatar" aria-hidden="true">${esc(memberInitial(member))}</span>
      <span class="matching-roster-member-copy"><b>${esc(memberName(member, mine ? "你" : "候选玩家"))}</b><small>${esc(status)}</small><span class="matching-roster-member-meta"><strong>${icon("trophy", 13)}${esc(rank)}</strong><strong>${icon(microphone === "开麦" ? "mic" : "volumeX", 13)}${esc(microphone)}</strong></span></span>
      <i>${ready ? "已加入" : ""}</i>
    </li>`;
  };
  return `<aside class="matching-roster" aria-label="用户栏">
    <header class="matching-roster-head"><span>用户栏</span><small>${teammates.length}/${target} 位队友</small></header>
    <ul class="matching-roster-list">${self ? row(self, true) : ""}${teammates.map((member) => row(member)).join("")}${shouldShowPlaceholder ? `<li class="matching-roster-placeholder"><div class="progress" aria-hidden="true"><div class="inner"></div></div><span>${mode === "ranked" ? "等待队友进入" : `等待 ${Math.max(1, target - teammates.length)} 位队友`}</span></li>` : ""}</ul>
  </aside>`;
}

function matchingSignal(awaiting, candidate) {
  return `<div class="matching-signal matching-signal--compact" aria-hidden="true">
    <span class="matching-signal-ring matching-signal-ring--one"></span><span class="matching-signal-ring matching-signal-ring--two"></span><span class="matching-signal-ring matching-signal-ring--three"></span>
    <span class="matching-player-card matching-player-card--center">${icon(awaiting ? "users" : "gamepad2", 34)}</span>
    <span class="matching-player-card matching-player-card--right" id="matching-candidate-mark">${awaiting ? esc(memberInitial(candidate)) : "?"}</span>
  </div>`;
}

function matchingProgress({ awaiting, isWaiting }) {
  return `<div class="matching-modal-progress matching-modal-progress--quiet">
    <div class="matching-progress-copy"><span class="match-eyebrow">LIVE SEARCH</span><strong id="match-title">${awaiting ? "对方已进入，正在连接" : isWaiting ? "队伍已锁定，等待成员确认" : "寻找与您游戏目标一致的玩家中"}</strong><small><b id="match-time">0秒</b> · 实时更新</small></div>
    <div class="matching-modal-steps" aria-label="匹配进度"><div class="matching-modal-step is-done" data-step="0"><i></i><span>需求已读取</span></div><div class="matching-modal-step is-active" data-step="1"><i></i><span>${isWaiting ? "等待成员确认" : awaiting ? "正在连接对方" : "持续寻找中"}</span></div><div class="matching-modal-step" data-step="2"><i></i><span>${awaiting ? "3秒后进入 Session" : "达到条件后进入房间"}</span></div></div>
  </div>`;
}

function actionsMarkup({ awaiting, mine, group, canStart }) {
  if (group) {
    if (["forming", "backfilling"].includes(group.state)) return `<div class="matching-confirm-actions" id="matching-confirm-actions">${canStart ? `<button type="button" class="matching-group-start" data-action="lock-forming-room" data-value="${esc(group.id)}"><span>就这些人，进入房间</span>${icon("check", 17)}</button>` : ""}<button type="button" data-action="cancel-match"><span>退出招募</span>${icon("x", 16)}</button></div>`;
    if (group.state === "waiting_confirmation") return `<div class="matching-confirm-actions" id="matching-confirm-actions">${mine?.decision !== "accepted" && !mine?.isOwner ? `<button type="button" data-action="reject-group-match" data-value="${esc(group.id)}"><span>暂不加入</span>${icon("x", 16)}</button><button type="button" data-action="confirm-group-match" data-value="${esc(group.id)}"><span>加入房间</span>${icon("check", 16)}</button>` : ""}<button type="button" data-action="cancel-match"><span>退出队伍</span>${icon("x", 16)}</button></div>`;
    const totalPlayers = (group.members || []).filter((member) => member.decision !== "rejected").length;
    const startLabel = totalPlayers >= Number(group.desiredTeammates || 1) + 1 ? "队伍已满，开房" : `已满 ${totalPlayers} 人，可开房`;
    return `<div class="matching-confirm-actions" id="matching-confirm-actions">${canStart ? `<button type="button" class="matching-group-start" data-action="start-group-match" data-value="${esc(group.id)}"><span>${startLabel}</span>${icon("arrowRight", 17)}</button>` : ""}<button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button></div>`;
  }
  return `<div class="matching-confirm-actions" id="matching-confirm-actions"><button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button></div>`;
}

function legacyGroupMatchingPage(state) {
  const group = state.match.group;
  const members = Array.isArray(group?.members) ? group.members : [];
  const owner = members.find((member) => member.isOwner);
  const teammates = members.filter((member) => !member.isOwner && member.decision !== "rejected");
  const target = Number(group?.desiredTeammates || 1);
  const minimum = Number(group?.minTeammates || Math.max(1, target - 1));
  const isWaiting = group?.state === "waiting_confirmation";
  const isForming = ["forming", "backfilling"].includes(group?.state);
  const mine = members.find((member) => member.userId === state.user.id);
  const profileName = (member) => member.profile?.nickname || (member.isOwner ? "队长" : "候选玩家");
  // Casual groups may be opened as soon as the owner and one teammate are
  // present. The requested range still controls who can join, but never
  // traps a two-player room behind the owner's original target.
  const canStart = !isWaiting && group?.ownerUserId === state.user.id && teammates.length >= 1;
  const allConfirmed = isWaiting && members.every((member) => member.decision === "accepted");
  const memberList = members.map((member) => `<li class="matching-group-member ${member.decision === "accepted" ? "is-ready" : ""}">
    <span class="matching-group-member-avatar">${(profileName(member) || "玩").slice(0, 1)}</span>
    <span><b>${esc(profileName(member))}${member.isOwner ? " · 队长" : ""}</b><small>${member.isOwner || member.decision === "accepted" ? "已准备" : isWaiting ? "等待确认" : "已加入队伍"}</small></span>
    <i>${member.decision === "accepted" ? "已确认" : ""}</i>
  </li>`).join("");
  const actions = isWaiting
    ? `<div class="matching-confirm-actions" id="matching-confirm-actions">
        ${mine?.decision !== "accepted" && !mine?.isOwner ? `<button type="button" data-action="reject-group-match" data-value="${esc(group.id)}"><span>暂不加入</span>${icon("x", 16)}</button><button type="button" data-action="confirm-group-match" data-value="${esc(group.id)}"><span>加入房间</span>${icon("check", 16)}</button>` : ""}
        <button type="button" data-action="cancel-match"><span>退出队伍</span>${icon("x", 16)}</button>
      </div>`
    : `<div class="matching-confirm-actions" id="matching-confirm-actions">
        ${canStart ? `<button type="button" class="matching-group-start" data-action="start-group-match" data-value="${esc(group.id)}"><span>${teammates.length >= target ? "队伍已满，开房" : `已满 ${teammates.length + 1} 人，可开房`}</span>${icon("arrowRight", 17)}</button>` : ""}
        <button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>
      </div>`;
  return homeShell(state, `<div class="matching-modal-page" role="dialog" aria-modal="true" aria-labelledby="matching-modal-title">
    <div class="matching-modal-backdrop" aria-hidden="true"></div>
    <section class="matching-modal matching-group-modal" data-matching-modal data-matching-group="${esc(group.id)}">
      <header class="matching-modal-head"><div><span class="matching-modal-live"><i></i>CASUAL GROUP / LIVE</span><p>队伍会在确认后一次性进入房间</p></div><button type="button" class="matching-modal-close" data-action="cancel-match" aria-label="退出匹配">${icon("x", 20)}</button></header>
      <div class="matching-modal-content">
        <div class="matching-signal matching-group-signal" aria-hidden="true"><span class="matching-signal-ring matching-signal-ring--one"></span><span class="matching-signal-ring matching-signal-ring--two"></span><span class="matching-player-card matching-player-card--center">${icon("users", 38)}</span></div>
        <div class="matching-modal-copy"><div class="match-eyebrow">FINDING YOUR PARTY / 01</div><h1 id="matching-modal-title">${isWaiting ? "队伍已锁定，等大家确认" : `已找到 ${teammates.length}/${target} 位队友`}</h1><p id="match-desc">${isWaiting ? (allConfirmed ? "所有人已确认，正在建立房间。" : "队长已发起开局，其他成员确认后进入房间。") : teammates.length >= 1 ? `当前共 ${teammates.length + 1} 人，队长可以开房，也可以继续等待更多队友。` : "再来 1 位队友即可开房，也可以继续等待更多队友。"}</p></div>
        <div class="matching-query" aria-label="本次匹配条件">${queryPills(state.need)}<span>${icon("users", 15)}找 ${target} 位队友</span></div>
        <ul class="matching-group-members" aria-label="当前队伍">${memberList}</ul>
      </div>
      <div class="matching-modal-progress"><div class="matching-modal-stats"><span><b id="pool-count">${Math.max(0, state.match.pool ?? 0)}</b><small>匹配池人数</small></span><span><b id="match-time">0秒</b><small>等待时长</small></span><span><b id="match-found">${teammates.length}/${target}</b><small>队友进度</small></span></div><div class="matching-modal-steps"><div class="matching-modal-step is-done"><i></i><span>需求已读取</span></div><div class="matching-modal-step ${isWaiting ? "is-done" : "is-active"}"><i></i><span>${isWaiting ? "队伍已锁定" : "正在寻找队友"}</span></div><div class="matching-modal-step ${isWaiting ? "is-active" : ""}"><i></i><span>${isWaiting ? "等待成员确认" : "至少 2 人即可开房"}</span></div></div></div>
      <footer class="matching-modal-footer"><p id="matching-footer-status"><i></i>${isWaiting ? "成员拒绝后会回到队伍招募状态。" : "至少 2 人后队长可以开房，也可以继续等待。"}</p>${actions}</footer>
    </section>
  </div>`, "home");
}

function legacyMatchingPage(state) {
  if (state.match.group) return groupMatchingPage(state);
  const pool = Math.max(0, state.match.pool ?? 0);
  const pair = state.match.pair;
  const candidate = state.match.candidate;
  const awaiting = pair?.state === "waiting_confirmation" && candidate;
  const mine = pair?.confirmations?.find((confirmation) => confirmation.user_id === state.user.id)?.decision;
  const theirs = pair?.confirmations?.find((confirmation) => confirmation.user_id !== state.user.id)?.decision;
  const confirmationCopy = mine === "accepted" && theirs === "accepted"
    ? "双方都已确定，正在建立房间。"
    : mine === "accepted"
      ? "你已准备，正在等对方确定。"
      : theirs === "accepted"
        ? "对方已确定，正在等你。"
        : "你们可以分别确定，不需要同时点击。";
  return homeShell(state, `<div class="matching-modal-page" role="dialog" aria-modal="true" aria-labelledby="matching-modal-title">
    <div class="matching-modal-backdrop" aria-hidden="true"></div>
    <section class="matching-modal" data-matching-modal>
      <header class="matching-modal-head">
        <div><span class="matching-modal-live"><i></i>MATCHING / LIVE</span><p>“机”缘正在读取当前匹配池</p></div>
        <button type="button" class="matching-modal-close" data-action="cancel-match" aria-label="退出匹配">${icon("x", 20)}</button>
      </header>

      <div class="matching-modal-content">
        <div class="matching-signal" aria-hidden="true">
          <span class="matching-signal-ring matching-signal-ring--one"></span>
          <span class="matching-signal-ring matching-signal-ring--two"></span>
          <span class="matching-signal-ring matching-signal-ring--three"></span>
          <span class="matching-player-card matching-player-card--left">01</span>
          <span class="matching-player-card matching-player-card--center">${icon("gamepad2", 38)}</span>
          <span class="matching-player-card matching-player-card--right" id="matching-candidate-mark">${awaiting ? esc((candidate.nickname || "玩家").slice(0, 1)) : "?"}</span>
        </div>
        <div class="matching-modal-copy">
          <div class="match-eyebrow">FINDING YOUR PEOPLE / 01</div>
          <h1 id="matching-modal-title">${awaiting ? `找到 ${esc(candidate.nickname || "一位玩家")}。` : "正在找同一局的人。"}</h1>
          <p id="match-desc">${awaiting ? confirmationCopy : "先检查官方硬规则，再比较位置与麦克风偏好。"}</p>
        </div>
        <div class="matching-query" aria-label="本次匹配条件">${queryPills(state.need)}</div>
        <div class="matching-ready-state" id="matching-ready-state" aria-live="polite" ${awaiting ? "" : "hidden"}>
          <span id="matching-ready-me" class="${mine === "accepted" ? "is-ready" : ""}">${mine === "accepted" ? icon("check", 15) : icon("clock", 15)}你：${mine === "accepted" ? "已确定" : "待确定"}</span>
          <span id="matching-ready-them" class="${theirs === "accepted" ? "is-ready" : ""}">${theirs === "accepted" ? icon("check", 15) : icon("clock", 15)}对方：${theirs === "accepted" ? "已确定" : "待确定"}</span>
        </div>
      </div>

      <div class="matching-modal-progress">
        <div class="matching-modal-stats">
          <span><b id="pool-count">${pool}</b><small>匹配池人数</small></span>
          <span><b id="match-time">0秒</b><small>等待时长</small></span>
          <span><b id="match-found">${awaiting ? 1 : 0}</b><small>锁定候选</small></span>
        </div>
        <div class="matching-modal-steps" aria-label="匹配进度">
          <div class="matching-modal-step is-done" data-step="0"><i></i><span>需求已读取</span></div>
          <div class="matching-modal-step is-active" data-step="1"><i></i><span id="match-title">正在扫描匹配池</span></div>
          <div class="matching-modal-step" data-step="2"><i></i><span>锁定合适玩家</span></div>
        </div>
      </div>

      <footer class="matching-modal-footer">
        <p id="matching-footer-status"><i></i>${awaiting ? "候选已暂时锁定，确认超时会自动回到匹配池。" : "匹配期间保持在线，我们会持续更新状态。"}</p>
        <div class="matching-confirm-actions" id="matching-confirm-actions">
          ${awaiting && mine !== "accepted" ? `<button type="button" data-action="reject-match"><span>不是这位</span>${icon("x", 16)}</button><button type="button" data-action="confirm-match"><span>确定是 TA</span>${icon("check", 16)}</button>` : ""}
          <button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>
        </div>
      </footer>
    </section>
  </div>`, "home");
}

function matchingWorkbench(state, { group = null } = {}) {
  const pair = state.match.pair;
  const candidate = state.match.candidate;
  const awaiting = !group && ["waiting_confirmation", "matched", "playing"].includes(pair?.state) && candidate;
  const isWaiting = group?.state === "waiting_confirmation";
  const isForming = ["forming", "backfilling"].includes(group?.state);
  const members = normalizedMembers(state, { group, candidate, awaiting });
  const mine = group ? members.find((member) => memberId(member) === state.user.id) : pair?.confirmations?.find((confirmation) => confirmation.user_id === state.user.id)?.decision;
  const theirs = !group && pair?.confirmations?.find((confirmation) => confirmation.user_id !== state.user.id)?.decision;
  const target = group
    ? Math.max(1, Number(group.hardMaxPlayers || 0) - 1 || Number(group.desiredTeammates || 1))
    : matchingMode(state.need) === "casual" ? Math.max(1, Number(state.need.target || 2) - 1) : 1;
  const minimum = group ? Math.min(target, Math.max(1, Number(group.minTeammates || target) || target)) : matchingMode(state.need) === "casual" ? Math.min(target, Math.max(1, Number(state.need.minTeammates || target) || target)) : 1;
  const targetLabel = minimum === target ? String(target) : `${minimum}–${target}`;
  const teammates = members.filter((member) => memberId(member) !== state.user.id && member.decision !== "rejected");
  const allConfirmed = group && isWaiting && members.every((member) => member.decision === "accepted");
  const canStart = Boolean(group && !isWaiting && group.ownerUserId === state.user.id && teammates.length >= 1 && teammates.length <= target);
  const currentTotalPlayers = teammates.length + 1;
  const title = group ? isWaiting ? "队伍已锁定，等大家确认" : isForming ? `FORMING ROOM · ${currentTotalPlayers} 人` : `已找到 ${teammates.length}/${targetLabel} 位队友` : awaiting ? "对方已进入，正在连接" : "寻找与您游戏目标一致的玩家中";
  const description = group ? isWaiting ? (allConfirmed ? "所有人已确认，正在建立房间。" : "队长已发起开局，其他成员确认后进入房间。") : isForming ? "这是同一个 Room，成员可以先聊天；兼容玩家会继续加入。" : teammates.length >= 1 ? `当前共 ${currentTotalPlayers} 人，队长可以停止招募，也可以继续等待。` : "继续寻找第一位兼容队友。" : awaiting ? "无需双方再次确认，连接完成后 3 秒进入 Session。" : "我们会按游戏、目的、位置与麦克风偏好持续寻找。";
  const footer = group ? isWaiting ? "成员拒绝后会回到队伍招募状态。" : isForming ? "达到游戏人数上限会自动停止招募。" : "找到第一位兼容队友后进入形成房间。" : awaiting ? "对方已加入，正在建立 Session 连接。" : "匹配期间保持在线，我们会持续更新状态。";
  return homeShell(state, `<div class="matching-modal-page" role="dialog" aria-modal="true" aria-labelledby="matching-modal-title">
    <div class="matching-modal-backdrop" aria-hidden="true"></div>
    <section class="matching-modal ${group ? "matching-group-modal" : ""}" data-matching-modal ${group ? `data-matching-group="${esc(group.id)}"` : ""}>
      <header class="matching-modal-head"><div><span class="matching-modal-live"><i></i>${group ? "CASUAL GROUP / LIVE" : "MATCHING / LIVE"}</span><p>${group ? "队伍会在确认后一次性进入房间" : "“机”缘正在为你寻找合适的队友"}</p></div><button type="button" class="matching-modal-close" data-action="cancel-match" aria-label="退出匹配">${icon("x", 20)}</button></header>
      <div class="matching-modal-content matching-modal-content--workbench">
        ${matchingRosterMarkup(state, { group, candidate, awaiting, isWaiting, target })}
        <section class="matching-workbench-main">
          ${matchingSignal(awaiting, candidate)}
          <div class="matching-modal-copy"><div class="match-eyebrow">${group ? "FINDING YOUR PARTY / 01" : "FINDING YOUR PEOPLE / 01"}</div><h1 id="matching-modal-title">${title}</h1><p id="match-desc">${description}</p></div>
          <div class="matching-query" aria-label="本次匹配条件">${queryPills(state.need)}</div>
          ${!group && awaiting ? `<div class="matching-auto-connect-note" aria-live="polite">${icon("link", 15)}对方已加入，无需确认</div>` : ""}
        </section>
      </div>
      ${matchingProgress({ awaiting, isWaiting })}
      <footer class="matching-modal-footer"><p id="matching-footer-status"><i></i>${footer}</p>${actionsMarkup({ awaiting, mine, group, canStart })}</footer>
    </section>
  </div>`, "home");
}

function groupMatchingPage(state) {
  return matchingWorkbench(state, { group: state.match.group });
}

export function matchingPage(state) {
  return state.match.group ? groupMatchingPage(state) : matchingWorkbench(state);
}

export function matchingPreviewPage() {
  const previewState = {
    authenticated: false,
    onboarded: false,
    user: { id: "preview-self", nickname: "你" },
    need: { game: "deadlock", mode: "casual", goal: "娱乐", target: 4, desiredTeammates: 3, minTeammates: 2, time: "现在", voice: true, details: { role: "位置不限" } },
    match: {
      status: "active",
      pool: 0,
      pair: null,
      candidate: null,
      group: {
        id: "preview-group",
        state: "searching",
        ownerUserId: "preview-self",
        desiredTeammates: 3,
        minTeammates: 2,
        members: [
          { userId: "preview-self", isOwner: true, decision: "accepted", profile: { nickname: "你" } },
          { userId: "preview-one", decision: null, rankCode: "oracle", microphonePreference: "on", profile: { nickname: "暮色玩家" } },
          { userId: "preview-two", decision: null, rankCode: "phantom", microphonePreference: "off", profile: { nickname: "河岸边" } },
        ],
      },
    },
  };
  return matchingWorkbench(previewState, { group: previewState.match.group });
}
