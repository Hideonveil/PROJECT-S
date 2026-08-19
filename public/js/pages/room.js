import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell } from "../ui.js";
import { GAME_BY_ID } from "../data.js";

const ACCOUNT_FIELDS = {
  deadlock: [{ key: "steamFriendCode", label: "Steam 好友码" }],
  valorant: [{ key: "riotId", label: "Riot ID" }],
  minecraft: [{ key: "gameId", label: "游戏 ID" }],
  hok: [{ key: "gameId", label: "游戏 ID" }],
};

const fieldsFor = (gameId) => ACCOUNT_FIELDS[gameId] || [{ key: "gameId", label: "游戏 ID" }];

function friendControl(state, partner) {
  if (!partner.id) return "";
  if ((state.friends || []).some((friend) => friend.id === partner.id)) {
    return `<span class="connection-friend-state is-connected">${icon("userCheck", 16)}已是机缘好友</span>`;
  }
  const incoming = (state.friendRequests?.incoming || []).some((request) => request.user?.id === partner.id);
  const outgoing = (state.friendRequests?.outgoing || []).some((request) => request.user?.id === partner.id);
  if (incoming) {
  return `<div class="connection-friend-request"><span>对方申请加你为机缘好友</span><div class="inline-actions">${button({ label: "接受", action: "accept-friend", value: partner.id, kind: "primary", size: "sm", iconName: "check" })}${button({ label: "暂不", action: "reject-friend", value: partner.id, kind: "ghost", size: "sm", iconName: "x" })}</div></div>`;
  }
  if (outgoing) return `<span class="connection-friend-state">${icon("clock", 16)}好友申请待确认</span>`;
  return button({ label: "添加为机缘好友", action: "add-project-friend", value: partner.id, kind: "outline", iconName: "userPlus" });
}

export function roomPage(state) {
  const room = state.room;
  const me = state.user;
  const partner = room.partner || {};
  const need = room.need?.game ? room.need : state.need;
  const game = GAME_BY_ID[need.game] || { name: need.game || "游戏" };
  const fields = fieldsFor(need.game);
  const myAccounts = (me.gameAccounts || {})[need.game] || {};
  const partnerAccounts = (partner.gameAccounts || {})[need.game] || {};
  const partnerExited = partner.memberStatus === "exited";
  const goodbyeRequests = room.goodbyeRequests || [];
  const mineGoodbye = goodbyeRequests.some((request) => request.userId === me.id);
  const partnerGoodbye = goodbyeRequests.some((request) => request.userId !== me.id);

  const myInputs = fields.map((field) => `<label class="connection-account-field"><span>${esc(field.label)}</span><input class="input" name="${field.key}" value="${esc(myAccounts[field.key] || "")}" placeholder="输入后自动同步给对方" autocomplete="off" /></label>`).join("");
  const partnerRows = fields.map((field) => {
    const value = String(partnerAccounts[field.key] || "").trim();
    return `<div class="connection-account-row" data-partner-account-key="${field.key}"><span>${esc(field.label)}</span><div data-partner-account-value class="${value ? "room-account-value" : "dim"}">${value ? `${esc(value)}${button({ label: "复制", action: "copy-room-account", value, kind: "ghost", size: "sm", iconName: "copy" })}` : "等待对方填写"}</div></div>`;
  }).join("");

  const farewellState = partnerExited
    ? "对方主动退出了游戏，本次不计入正常对局。"
    : mineGoodbye && partnerGoodbye
      ? "双方都已拜拜，正在关闭本次连接。"
      : mineGoodbye
        ? "你已提出拜拜，等待对方回应。"
        : partnerGoodbye
          ? "对方想结束这次匹配，你可以回应拜拜。"
          : "玩完后，由双方各自确认拜拜。";

  return homeShell(state, `<main class="connection-room room-page" data-connection-room>
    <header class="connection-room__status">
      <div><span class="connection-room__eyebrow"><i></i>LIVE CONNECTION / ${esc(game.name)}</span><h1>临时连接舱</h1><p>在这里交换游戏账号、聊两句，然后去游戏里一起玩。</p></div>
      <div class="connection-room__meta"><span class="room-code">${icon("radio", 16)}${esc(room.code)}</span><span class="room-timer">${icon("clock", 16)}<b id="room-timer">00:00</b></span>${button({ label: "主动退出", action: "exit-room", kind: "ghost", size: "sm", iconName: "logOut" })}</div>
    </header>

    <section class="connection-room__players" aria-label="本次连接的玩家">
      <article class="connection-player is-me">
        <span class="connection-player__index">PLAYER 01 / YOU</span>${avatarWrap(me.avatarKey, 76, me.online)}<div><h2>${esc(me.nickname || "我")}</h2><p>${esc(me.device || "PC")} · ${esc(me.playStyle || "准备一起玩")}</p></div><span class="connection-player__live">ONLINE</span>
      </article>
      <div class="connection-axis" aria-hidden="true"><span></span><b>${icon("link2", 22)}</b><span></span></div>
      <article class="connection-player is-partner ${partnerExited ? "is-exited" : ""}">
        <span class="connection-player__index">PLAYER 02 / PARTNER</span>${avatarWrap(partner.avatarKey, 76, partner.online)}<div><h2>${esc(partner.name || partner.nickname || "对方玩家")}</h2><p>${esc(partner.device || "PC")} · ${partnerExited ? "已主动退出" : esc(partner.playStyle || "正在连接")}</p></div><span class="connection-player__live">${partnerExited ? "EXITED" : "CONNECTED"}</span>
      </article>
    </section>

    <div class="connection-tape" aria-hidden="true"><span>PLAYER LINKED / NEVER PLAY ALONE / PLAYER LINKED / NEVER PLAY ALONE /</span></div>

    <section class="connection-room__exchange">
      <div class="connection-exchange-column is-me"><div class="connection-section-title"><span>01</span><div><h2>我的 ${esc(game.name)} 账号</h2><p>保存后，对方会在当前页面直接看到。</p></div></div><form data-form="room-account">${myInputs}${button({ label: "保存账号信息", action: "save-room-account", kind: "primary", iconName: "check" })}</form></div>
      <div class="connection-exchange-column is-partner"><div class="connection-section-title"><span>02</span><div><h2>${esc(partner.name || "对方")} 的账号</h2><p>复制后去游戏内添加。</p></div></div><div class="connection-partner-accounts">${partnerRows}</div><div data-room-friendship>${friendControl(state, partner)}</div></div>
    </section>

    <section class="connection-room__chat">
      <div class="connection-section-title"><span>03</span><div><h2>房间聊天</h2><p>只留必要的信息：好友码、进服方式和一句“来吧”。</p></div></div>
      <div id="room-chat" class="chat-messages"><div class="chat-empty">还没有消息，打个招呼吧</div></div>
      <form data-form="room-chat" class="chat-composer"><input class="input" id="chat-input" maxlength="500" placeholder="输入消息…" autocomplete="off" /><button class="btn btn--primary" id="chat-send" type="submit">${icon("send", 16)}<span>发送</span></button></form>
    </section>

    <section class="connection-room__farewell ${partnerExited ? "is-exited" : ""}">
      <div><span>04 / CLOSE THE LOOP</span><h2 data-room-goodbye-status>${esc(farewellState)}</h2><p>点击后会先询问：确定要拜拜吗？只有双方都确认，才会进入正常评价。</p></div>
      ${partnerExited
        ? button({ label: "返回匹配", action: "back-to-match", kind: "primary", iconName: "gamepad2" })
        : `<div class="connection-farewell-actions" data-room-farewell-actions>${mineGoodbye ? button({ label: "撤回", action: "withdraw-goodbye", kind: "ghost", iconName: "refreshCw" }) : ""}${button({ label: partnerGoodbye && !mineGoodbye ? "回应拜拜" : "拜拜", action: "say-goodbye", kind: "primary", extra: "connection-goodbye-button", iconName: "handshake", disabled: mineGoodbye })}</div>`}
    </section>
  </main>`, "room");
}
