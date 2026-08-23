import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell } from "../ui.js";
import { GAME_BY_ID } from "../data.js";
import { memberDisplayName, sessionMembers } from "../session-members.js";

const ACCOUNT_FIELDS = {
  deadlock: [{ key: "steamFriendCode", label: "Steam 好友码" }],
  valorant: [{ key: "riotId", label: "Riot ID" }],
  minecraft: [{ key: "gameId", label: "游戏 ID" }],
  hok: [{ key: "gameId", label: "游戏 ID" }],
};

const fieldsFor = (gameId) => ACCOUNT_FIELDS[gameId] || [{ key: "gameId", label: "游戏 ID" }];

function friendControl() {
  return `<span class="connection-friend-paused">${icon("users", 16)}好友系统 COMING SOON</span>`;
}

function memberCard(member, index, currentUserId) {
  const isMe = member.id === currentUserId;
  const exited = member.memberStatus === "exited";
  const name = memberDisplayName(member, isMe ? "我" : "玩家");
  const role = isMe ? "YOU" : "MEMBER";
  const status = exited ? "EXITED" : isMe ? "ONLINE" : "CONNECTED";
  return `<article class="connection-player ${isMe ? "is-me" : "is-partner"} ${exited ? "is-exited" : ""}">
    <span class="connection-player__index">PLAYER ${String(index + 1).padStart(2, "0")} / ${role}</span>
    ${avatarWrap(member.avatarKey, 76, member.online)}
    <div><h2>${esc(name)}</h2><p>${esc(member.device || "PC")} · ${exited ? "已主动退出" : esc(member.playStyle || (isMe ? "准备一起玩" : "正在连接"))}</p></div>
    <span class="connection-player__live">${status}</span>
  </article>`;
}

function accountRows(member, fields, gameId) {
  const accounts = member.gameAccounts?.[gameId] || {};
  return fields.map((field) => {
    const value = String(accounts[field.key] || "").trim();
    return `<div class="connection-account-row" data-member-id="${esc(member.id)}" data-member-account-key="${esc(field.key)}"><span>${esc(field.label)}</span><div data-partner-account-value class="${value ? "room-account-value" : "dim"}">${value ? `${esc(value)}${button({ label: "复制", action: "copy-room-account", value, kind: "ghost", size: "sm", iconName: "copy" })}` : "这位成员还没填写"}</div></div>`;
  }).join("");
}

export function roomPage(state) {
  const room = state.room || {};
  const me = state.user || {};
  const model = sessionMembers(room, me.id);
  const members = model.members.length ? model.members : [{ ...me, id: me.id, memberStatus: "active" }];
  const need = room.need?.game ? room.need : state.need;
  const game = GAME_BY_ID[need.game] || { name: need.game || "游戏" };
  const fields = fieldsFor(need.game);
  const myMember = model.currentMember || me;
  const myAccounts = (myMember.gameAccounts || me.gameAccounts || {})[need.game] || {};
  const mineGoodbye = model.requestIds.has(me.id);
  const goodbyeCount = model.goodbyeCount;
  const goodbyeDenominator = model.goodbyeDenominator;
  const goodbyeRemaining = Math.max(0, goodbyeDenominator - goodbyeCount);
  const goodbyeButtonLabel = goodbyeCount > 0 ? `拜拜（${goodbyeCount}/${goodbyeDenominator}）` : "拜拜";
  const allMembersLabel = `${model.activeMemberCount || members.length} 位当前成员`;

  const myInputs = fields.map((field) => `<label class="connection-account-field"><span>${esc(field.label)}</span><input class="input" name="${field.key}" value="${esc(myAccounts[field.key] || "")}" placeholder="保存后所有成员都能看到" autocomplete="off" /></label>`).join("");
  const otherAccounts = model.otherMembers.length
    ? model.otherMembers.map((member) => `<article class="connection-member-account" data-member-account-card="${esc(member.id)}"><header><strong>${esc(memberDisplayName(member))}</strong><small>${member.memberStatus === "exited" ? "已离开" : "成员账号"}</small></header>${accountRows(member, fields, need.game)}</article>`).join("")
    : `<div class="dim">暂时没有其他成员。</div>`;
  const farewellState = goodbyeCount >= goodbyeDenominator
    ? `${goodbyeCount}/${goodbyeDenominator} 位成员都已拜拜，正在关闭本次连接。`
    : mineGoodbye
      ? `你已拜拜，等待其余 ${goodbyeRemaining} 位成员。`
      : goodbyeCount > 0
        ? `${goodbyeCount}/${goodbyeDenominator} 位成员已拜拜，你可以回应。`
        : `玩完后，由 ${allMembersLabel} 各自确认拜拜。`;

  return homeShell(state, `<main class="connection-room room-page" data-connection-room>
    <header class="connection-room__status">
      <div><span class="connection-room__eyebrow"><i></i>LIVE CONNECTION / ${esc(game.name)}</span><h1>临时连接舱</h1><p>在这里交换游戏账号、聊两句，然后去游戏里一起玩。</p></div>
      <div class="connection-room__meta"><span class="room-code">${icon("radio", 16)}${esc(room.code || "SESSION")}</span><span class="room-timer">${icon("clock", 16)}<b id="room-timer">00:00</b></span>${button({ label: "主动退出", action: "exit-room", kind: "ghost", size: "sm", iconName: "logOut" })}</div>
    </header>

    <section class="connection-room__players" aria-label="本次连接的玩家">
      ${members.map((member, index) => memberCard(member, index, me.id)).join("")}
    </section>

    <div class="connection-tape" aria-hidden="true"><span>MEMBERS CONNECTED / NEVER PLAY ALONE / MEMBERS CONNECTED / NEVER PLAY ALONE /</span></div>

    <section class="connection-room__exchange">
      <div class="connection-exchange-column is-me"><div class="connection-section-title"><span>01</span><div><h2>我的 ${esc(game.name)} 账号</h2><p>保存后，当前 Session 的所有成员都能看到。</p></div></div><form data-form="room-account">${myInputs}${button({ label: "保存账号信息", action: "save-room-account", kind: "primary", iconName: "check" })}</form></div>
      <div class="connection-exchange-column is-partner"><div class="connection-section-title"><span>02</span><div><h2>成员账号</h2><p>按成员分别查看并复制。</p></div></div><div class="connection-partner-accounts">${otherAccounts}</div><div data-room-friendship>${friendControl()}</div></div>
    </section>

    <section class="connection-room__chat">
      <div class="connection-section-title"><span>03</span><div><h2>房间聊天</h2><p>所有成员都能看到好友码、进服方式和消息。</p></div></div>
      <div id="room-chat" class="chat-messages"><div class="chat-empty">还没有消息，打个招呼吧</div></div>
      <form data-form="room-chat" class="chat-composer"><input class="input" id="chat-input" maxlength="500" placeholder="输入消息…" autocomplete="off" /><button class="btn btn--primary" id="chat-send" type="submit">${icon("send", 16)}<span>发送</span></button></form>
    </section>

    <section class="connection-room__farewell" data-room-farewell>
      <div><span>04 / CLOSE THE LOOP</span><h2 data-room-goodbye-status>${esc(farewellState)}</h2><p>拜拜是正常共同结束；只有当前 Session 的所有成员都确认后，才会进入正常评价。</p></div>
      <div class="connection-farewell-actions" data-room-farewell-actions>${button({ label: goodbyeButtonLabel, action: mineGoodbye ? "withdraw-goodbye" : "say-goodbye", kind: "primary", extra: "connection-goodbye-button", iconName: "handshake" })}</div>
    </section>
  </main>`, "room");
}
