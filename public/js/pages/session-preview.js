import { avatarWrap } from "../avatar.js";
import { icon } from "../icons.js";
import { GAME_BY_ID } from "../data.js";
import { rankLabel } from "../ranks.js?v=20260821-rank-label-01";
import { esc, homeShell } from "../ui.js";
import { memberDisplayName, sessionMembers } from "../session-members.js";

const PREVIEW_PLAYERS = [
  { id: "preview-self", name: "hideonbush", handle: "你 · 已就绪", avatarKey: "hideonbush", online: true, tone: "is-me" },
  { id: "preview-partner", name: "hideonhome", handle: "对方 · 已就绪", avatarKey: "hideonhome", online: true, tone: "is-partner" },
];
const PREVIEW_MEMBER_COUNT = PREVIEW_PLAYERS.length;

const PREVIEW_NEED = {
  game: "deadlock",
  goal: "冲分",
  voice: true,
  target: PREVIEW_MEMBER_COUNT,
  details: { rank: "oracle", role: "主核", teammateRole: "辅助", voicePreference: "on" },
};

const PREVIEW_PARTNER_NEED = {
  ...PREVIEW_NEED,
  details: { ...PREVIEW_NEED.details, role: "辅助", teammateRole: "主核" },
};

function modeLabel(need) {
  return need?.goal === "娱乐" || need?.mode === "casual" ? "休闲" : "冲分";
}

function gameLabel(need) {
  return GAME_BY_ID[need?.game]?.name || need?.game || "Deadlock";
}

function voiceLabel(need) {
  const preference = need?.details?.voicePreference || (need?.voice === true ? "on" : need?.voice === false ? "off" : "any");
  return preference === "on" ? "开麦" : preference === "off" ? "不开麦" : "都可以";
}

function rankValue(need) {
  if (modeLabel(need) === "休闲") return "休闲";
  return rankLabel(need?.details?.rank || need?.rankCode, "段位待定");
}

function roleValue(need) {
  return need?.details?.role || need?.role || "位置不限";
}

function roleTokens(value) {
  return String(value || "")
    .split(/[\s/、，,·]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function roleRequirementSatisfied(expected, own) {
  const expectedTokens = roleTokens(expected);
  const ownTokens = roleTokens(own);
  if (!expectedTokens.length || expectedTokens.some((token) => token === "位置不限" || token === "不限")) return true;
  if (!ownTokens.length || ownTokens.some((token) => token === "位置不限" || token === "不限")) return true;
  return expectedTokens.some((token) => ownTokens.includes(token));
}

function rolePairMatches(mineNeed, partnerNeed) {
  const mineRole = roleValue(mineNeed);
  const partnerRole = roleValue(partnerNeed);
  const mineExpected = mineNeed?.details?.teammateRole || mineNeed?.teammateRole || "位置不限";
  const partnerExpected = partnerNeed?.details?.teammateRole || partnerNeed?.teammateRole || "位置不限";
  return roleRequirementSatisfied(mineExpected, partnerRole) && roleRequirementSatisfied(partnerExpected, mineRole);
}

function fitGridStyle(memberCount) {
  const columns = [];
  for (let index = 0; index < memberCount; index += 1) {
    columns.push("minmax(0, 1fr)");
    if (index < memberCount - 1) columns.push("minmax(64px, .42fr)");
  }
  return `grid-template-columns:${columns.join(" ")};`;
}

function fitLink(matches, label) {
  return `<span class="session-fit-link ${matches ? "is-match" : ""}" aria-label="${label}"><i class="session-fit-line" aria-hidden="true"></i>${matches ? icon("check", 13) : ""}</span>`;
}

function groupFitCells(members, valueFor, matches, tag = "strong") {
  return members.map((member, index) => {
    const value = `<${tag} class="session-fit-member" title="${esc(memberDisplayName(member))}">${esc(valueFor(member))}</${tag}>`;
    if (index >= members.length - 1) return value;
    return `${value}${fitLink(matches, matches ? "匹配" : "未完全匹配")}`;
  }).join("");
}

function modelFor(state, preview = false) {
  if (preview) return {
    players: PREVIEW_PLAYERS,
    memberNeeds: PREVIEW_PLAYERS.map((player, index) => ({ ...player, need: index === 0 ? PREVIEW_NEED : PREVIEW_PARTNER_NEED, memberStatus: "active" })),
    mine: PREVIEW_NEED,
    partner: PREVIEW_PARTNER_NEED,
    mineId: PREVIEW_PLAYERS[0].id,
    partnerId: PREVIEW_PLAYERS[1].id,
    currentUserId: PREVIEW_PLAYERS[0].id,
    goodbyeRequests: [],
    target: PREVIEW_MEMBER_COUNT,
    activeMemberCount: PREVIEW_MEMBER_COUNT,
    goodbyeCount: 0,
    goodbyeDenominator: PREVIEW_MEMBER_COUNT,
    preview: true,
  };
  const room = state.room || {};
  const members = Array.isArray(room.members) ? room.members : [];
  const me = members.find((member) => member.id === state.user.id) || state.user || {};
  const memberModel = sessionMembers(room, state.user.id);
  const partner = memberModel.otherMembers[0] || members.find((member) => member.id !== state.user.id) || {};
  const mine = me.need || state.need || room.need || {};
  const sourcePlayers = memberModel.members.length ? memberModel.members : [me, partner];
  const players = sourcePlayers.map((member, index) => ({
    id: member.id || `player-${index}`,
    label: member.username || member.handle || member.id || `player-${index}`,
    name: member.nickname || member.name || (member.id === state.user.id ? state.user.nickname : "玩家"),
    handle: member.id === state.user.id ? "你 · 已就绪" : "成员 · 已就绪",
    avatarKey: member.avatarKey || "",
    online: member.online !== false,
    tone: member.id === state.user.id ? "is-me" : index === 1 ? "is-partner" : "",
  }));
  return {
    players,
    memberNeeds: sourcePlayers,
    mine,
    partner: partner.need || mine,
    mineId: me.username || me.handle || me.id || state.user.username || state.user.handle || state.user.id,
    partnerId: partner.username || partner.handle || partner.id || players.find((player) => player.id !== (me.id || state.user.id))?.label || "",
    currentUserId: state.user.id,
    goodbyeRequests: Array.isArray(room.goodbyeRequests) ? room.goodbyeRequests : [],
    target: memberModel.targetTotalPlayers,
    activeMemberCount: memberModel.activeMemberCount,
    goodbyeCount: memberModel.goodbyeCount,
    goodbyeDenominator: memberModel.goodbyeDenominator,
    preview: false,
    roomCode: room.code || "SESSION",
  };
}

function playerIdLabel(model, side, fallback) {
  const id = side === "mine" ? model.mineId : model.partnerId;
  return id || fallback;
}

function fitRows(model) {
  const members = (model.memberNeeds || []).length ? model.memberNeeds : [
    { id: model.mineId, need: model.mine },
    { id: model.partnerId, need: model.partner },
  ];
  const rows = [
    ["游戏", (member) => gameLabel(member.need)],
    ["目的", (member) => member.need?.goal || modeLabel(member.need)],
    ["段位", (member) => rankValue(member.need)],
    ["位置", (member) => roleValue(member.need)],
    ["开麦", (member) => voiceLabel(member.need)],
  ];
  if (members.length <= 2) {
    const mine = members[0] || { need: model.mine };
    const partner = members[1] || { need: model.partner };
    const pairRows = [
      ["游戏", gameLabel(mine.need), gameLabel(partner.need), gameLabel(mine.need) === gameLabel(partner.need)],
      ["目的", mine.need?.goal || modeLabel(mine.need), partner.need?.goal || modeLabel(partner.need), (mine.need?.goal || modeLabel(mine.need)) === (partner.need?.goal || modeLabel(partner.need))],
      ["段位", rankValue(mine.need), rankValue(partner.need), rankValue(mine.need) === rankValue(partner.need)],
      ["位置", roleValue(mine.need), roleValue(partner.need), rolePairMatches(mine.need, partner.need)],
      ["开麦", voiceLabel(mine.need), voiceLabel(partner.need), voiceLabel(mine.need) === voiceLabel(partner.need)],
    ];
    return pairRows.map(([label, mineValue, partnerValue, matches]) => `<div class="session-fit-row" role="row"><span class="session-fit-label">${esc(label)}</span><div class="session-fit-conditions" style="${fitGridStyle(members.length)}"><strong class="session-fit-member">${esc(mineValue)}</strong>${fitLink(matches, matches ? "匹配" : "不匹配")}<strong class="session-fit-member">${esc(partnerValue)}</strong></div></div>`).join("");
  }
  return rows.map(([label, valueFor]) => {
    const values = members.map(valueFor);
    const matches = values.every((value) => value === values[0]);
    return `<div class="session-fit-row session-fit-row--group" role="row"><span class="session-fit-label">${esc(label)}</span><div class="session-fit-conditions session-fit-conditions--group" style="${fitGridStyle(members.length)}">${groupFitCells(members, valueFor, matches)}</div></div>`;
  }).join("");
}

function playerRail(model) {
  const visiblePlayers = model.players.length ? model.players : PREVIEW_PLAYERS;
  return `<aside class="session-preview-rail" aria-label="用户栏">
    <header class="session-preview-rail__head"><span class="session-preview-kicker"><i></i>SESSION / 已连接</span><div><b>成员栏</b><small>${model.activeMemberCount || visiblePlayers.length} / ${model.target} 已满</small></div></header>
    <div class="session-preview-players">
      ${visiblePlayers.map((player, index) => `<article class="session-preview-player ${player.tone}"><span class="session-preview-player__index">${String(index + 1).padStart(2, "0")}</span>${avatarWrap(player.avatarKey, 58, player.online)}<div><b>${esc(player.name)}</b><small>${esc(player.handle)}</small><span>${index === 0 ? "已进入 Session" : "已确认连接"}</span></div><i>${icon("check", 15)}</i></article>`).join("")}
    </div>
    <div class="session-preview-rail__note"><span>${icon("star", 16)}</span><p>房间已满，匹配计时已停止。<br />接下来只保留交流与离开。</p></div>
    <div class="session-preview-rail__footer"><span>成员 ID</span><b title="${esc(visiblePlayers.map((player) => player.label || player.id).join(" / "))}">${esc(visiblePlayers.map((player) => player.label || player.id).join(" / "))}</b></div>
  </aside>`;
}

function goodbyeSummary(model) {
  const activeIds = new Set((model.memberNeeds || model.players || [])
    .filter((member) => (member.memberStatus || "active") === "active")
    .map((member) => member.id));
  const requestIds = new Set((model.goodbyeRequests || []).map((request) => request.userId).filter((id) => activeIds.has(id)));
  const count = requestIds.size;
  return {
    count,
    denominator: model.goodbyeDenominator || model.activeMemberCount || model.players.length || 1,
    mine: requestIds.has(model.currentUserId),
  };
}

function chatPanel(model) {
  const quickReplies = ["怎么说，来一把？", "行", "我加你", "开麦吗？"];
  const seedMessages = model.preview ? `<div class="session-preview-message session-preview-message--partner"><span>hideonhome</span><p>怎么说，来一把？</p><time>现在</time></div><div class="session-preview-message session-preview-message--me"><span>你</span><p>行，我加你。</p><time>现在</time></div>` : `<div class="chat-empty">还没有消息，打个招呼吧</div>`;
  return `<section class="session-preview-chat" aria-label="Session 聊天">
    <header class="session-preview-chat__head"><div><span class="session-preview-kicker">成员的选择</span><h2>高度拟合 <i>${icon("star", 18)}</i></h2><p>匹配条件已对齐，现在把这局玩起来。</p></div><span class="session-preview-live"><i></i>LIVE</span></header>
    <div class="session-fit-table" role="table" aria-label="成员匹配条件"><div class="session-fit-row session-fit-row--head session-fit-row--group" role="row"><span></span><div class="session-fit-conditions session-fit-conditions--group" style="${fitGridStyle(model.players.length)}">${groupFitCells(model.players, (player) => player.label || player.name, true, "b")}</div></div>${fitRows(model)}</div>
    <div class="session-preview-chat__divider"><span>聊天</span><i></i><small>实时同步</small></div>
    <div id="room-chat" class="session-preview-messages" aria-label="聊天记录">${seedMessages}</div>
    <div class="session-preview-quick" aria-label="快捷回复">${quickReplies.map((reply) => `<button type="button" data-chat-quick-reply="${esc(reply)}">${esc(reply)}</button>`).join("")}</div>
    <form data-form="room-chat" class="session-preview-composer"><input type="text" id="chat-input" maxlength="500" placeholder="说点什么…" aria-label="输入消息" autocomplete="off" /><button type="submit" aria-label="发送">${icon("send", 17)}</button></form>
  </section>`;
}

function sessionMarkup(model) {
  const goodbye = goodbyeSummary(model);
  const goodbyeButtonLabel = goodbye.count > 0 ? `拜拜（${goodbye.count}/${goodbye.denominator}）` : "拜拜";
  return `<div class="matching-modal-page" role="dialog" aria-modal="true" aria-labelledby="session-title"><div class="matching-modal-backdrop" aria-hidden="true"></div><section class="matching-modal matching-session-modal" data-session-preview>
    <header class="matching-modal-head"><div><span class="matching-modal-live"><i></i>MATCHING / LIVE → SESSION</span><p>房间满员后，仍在同一个匹配窗口里继续交流</p></div><span class="matching-session-state">${icon("radio", 14)}已满员 · 同窗切换</span></header>
    <div class="matching-session-title"><div class="match-eyebrow">THE ROOM IS FULL / ${model.target}</div><h1 id="session-title">这一局，开始了。</h1><p>匹配计时已关闭，成员栏保留；右侧变成聊天。</p></div>
    <div class="matching-session-content">${playerRail(model)}<div class="matching-session-main">${chatPanel(model)}</div></div>
    <footer class="matching-modal-footer matching-session-footer"><div class="matching-session-footer-left"><button type="button" class="session-preview-goodbye" data-action="${goodbye.mine ? "withdraw-goodbye" : "say-goodbye"}" data-session-goodbye-button aria-label="${esc(`${goodbyeButtonLabel}${goodbye.mine ? "，再次点击撤回" : ""}`)}">${icon("handshake", 17)}<span data-session-goodbye-count>${esc(goodbyeButtonLabel)}</span></button><p data-session-goodbye-status><i></i>${goodbye.count}/${goodbye.denominator} 已确认，所有成员都确认后进入赛后反馈。</p></div><button type="button" class="session-preview-leave" data-action="exit-room">${icon("logOut", 16)}<span>离开</span></button></footer>
  </section></div>`;
}

export function sessionPage(state) {
  return homeShell(state, sessionMarkup(modelFor(state)), "room");
}

export function sessionPreviewPage() {
  const previewState = { authenticated: false, onboarded: false, user: { id: "preview-self", nickname: "hideonbush", handle: "hideonbush#8F2K", online: true }, need: PREVIEW_NEED, match: { status: "active", pool: 0, pair: null, candidate: null, group: null } };
  return homeShell(previewState, sessionMarkup(modelFor(previewState, true)), "home");
}
