import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, needSummary, shell, statusPill } from "../ui.js";
import { GAME_BY_ID } from "../data.js";

const ACCOUNT_FIELDS = {
  minecraft: [
    { key: "steamFriendCode", label: "Steam 好友码" },
    { key: "gameId", label: "游戏 ID" },
  ],
  stardew: [
    { key: "steamFriendCode", label: "Steam 好友码" },
    { key: "gameId", label: "游戏 ID" },
  ],
  pubg: [
    { key: "steamFriendCode", label: "Steam 好友码" },
    { key: "gameId", label: "游戏 ID" },
  ],
  deadlock: [{ key: "steamFriendCode", label: "Steam 好友码" }],
  valorant: [{ key: "riotId", label: "Riot ID" }],
  league: [
    { key: "riotId", label: "Riot ID" },
    { key: "gameId", label: "游戏 ID" },
  ],
  genshin: [{ key: "uid", label: "UID" }],
  hok: [{ key: "gameId", label: "游戏 ID" }],
};

function fieldsFor(gameId) {
  return ACCOUNT_FIELDS[gameId] || [{ key: "gameId", label: "游戏 ID" }];
}

export function roomPage(state) {
  const room = state.room;
  const me = state.user;
  const need = room.need?.game ? room.need : state.need;
  const game = GAME_BY_ID[need.game] || { name: need.game || "游戏" };
  const members = room.members || [];
  const activeMembers = members.filter((m) => m.memberStatus !== "exited");
  const partner = room.partner || {};
  const partnerExited = partner.memberStatus === "exited";
  const fields = fieldsFor(need.game);
  const myAccounts = (me.gameAccounts || {})[need.game] || {};
  const partnerAccounts = (partner.gameAccounts || {})[need.game] || {};
  const primaryValue = Object.values(partnerAccounts).find((v) => String(v || "").trim()) || "";

  const memberRows = members
    .map((p) => {
      const exited = p.memberStatus === "exited";
      const avatar = p.id === me.id
        ? avatarWrap(p.avatarKey, 52, p.online !== false)
        : `<a href="#/player/${p.id}" data-nav aria-label="查看玩家主页">${avatarWrap(p.avatarKey, 52, p.online !== false)}</a>`;
      return `<div class="room-member ${p.id === me.id ? "room-member--host" : ""}">
        ${avatar}
        <div class="room-member-info">
          <div class="room-member-name">${esc(p.name || p.nickname || "玩家")}</div>
          <div class="room-member-meta">${esc(p.device || "PC")} 路 ${exited ? "已退出本次游戏" : esc(p.playStyle || "正在游戏中")}</div>
        </div>
        ${exited ? statusPill("DONE", "已退出") : statusPill("PLAYING", "PLAYING")}
      </div>`;
    })
    .join("");

  const accountInputs = fields
    .map(
      (f) => `<div class="field" style="margin:0">
        <label class="label" for="room-account-${f.key}">${esc(f.label)}</label>
        <input class="input" id="room-account-${f.key}" name="${f.key}" value="${esc(myAccounts[f.key] || "")}" placeholder="填写后对方可以一键复制" autocomplete="off" />
      </div>`
    )
    .join("");

  const partnerAccountRows = fields
    .map((f) => {
      const value = String(partnerAccounts[f.key] || "").trim();
      if (!value) return `<div class="kv-row" style="border:0;padding:0"><div class="kv-label">${esc(f.label)}</div><div class="kv-value dim">对方还没填写</div></div>`;
      return `<div class="kv-row" style="border:0;padding:0">
        <div class="kv-label">${esc(f.label)}</div>
        <div class="kv-value room-account-value">${esc(value)}
          ${button({ label: "复制", action: "copy-room-account", value, kind: "ghost", size: "sm", iconName: "copy" })}
        </div>
      </div>`;
    })
    .join("");

  const actionArea = partnerExited
    ? `<div class="card" style="border-color:var(--danger-border);background:var(--danger-dim);display:flex;flex-direction:column;gap:12px">
        <div class="inline-actions">${statusPill("DONE")}<strong>其他玩家已离开</strong></div>
        <p class="dim" style="font-size:13px">你可以继续留在房间，也可以返回匹配开始新的连接。</p>
        <div>${button({ label: "返回匹配", action: "back-to-match", kind: "primary", iconName: "gamepad2" })}</div>
      </div>`
    : `<div class="card" style="display:flex;flex-direction:column;gap:12px">
        <div class="inline-actions">${statusPill("PLAYING")}<strong>匹配成功，游戏已经开始</strong></div>
        <p class="dim" style="font-size:13px">先去游戏里添加对方，再把好友码填到下面，方便双方连接。</p>
      </div>`;

  return shell(
    state,
    "room",
    `<div class="room-page">
      <div class="room-panel">
        <div class="room-head">
          <div>
            <div class="page-eyebrow">${icon("link2", 13)} 临时游戏连接空间</div>
            <div class="room-code">${icon("copy", 16)} ${esc(room.code)}</div>
          </div>
          ${statusPill(room.status === "completed" || partnerExited ? "DONE" : "PLAYING", room.status === "completed" || partnerExited ? "已结束" : "PLAYING")}
        </div>
        ${needSummary(need, { compact: true })}

        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="section-head"><h2 class="section-title">这次一起玩的人</h2><span class="section-note">${activeMembers.length}/${esc(need.target || 5)} 人</span></div>
          <div class="room-members">${memberRows}</div>
          <p class="muted" style="font-size:12px">点击对方头像可以查看玩家主页</p>
        </div>

        ${actionArea}

        <div class="card" style="display:flex;flex-direction:column;gap:12px">
          <div class="section-head"><h2 class="section-title">我的 ${esc(game.name)} 账号</h2><span class="section-note">对方在房间里能看到</span></div>
          <form data-form="room-account" style="display:flex;flex-direction:column;gap:12px">
            ${accountInputs}
            ${button({ label: "保存账号信息", action: "save-room-account", kind: "primary", iconName: "check" })}
          </form>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:12px">
          <div class="section-head"><h2 class="section-title">${esc(partner.name || "对方")} 的游戏账号</h2><span class="section-note">一键复制后去游戏内添加</span></div>
          ${partnerAccountRows}
          ${primaryValue ? button({ label: "添加游戏好友", action: "add-game-friend", value: primaryValue, kind: "outline", iconName: "userPlus" }) : ""}
        </div>
      </div>
      <section class="card room-chat-card">
        <div class="section-head"><h2 class="section-title">聊天</h2><span class="section-note">同步好友码和进服信息</span></div>
        <div id="room-chat" class="chat-messages"><div class="chat-empty">还没有消息，打个招呼吧</div></div>
        <form data-form="room-chat" class="chat-composer">
          <input class="input" id="chat-input" maxlength="500" placeholder="输入消息…" autocomplete="off" />
          <button class="btn btn--primary" id="chat-send" type="submit">${icon("send", 16)}<span>发送</span></button>
        </form>
      </section>
    </div>`,
    {
      immersive: true,
      topRight: button({ label: "5s 后可以退出", action: "exit-room", kind: "ghost", size: "sm", iconName: "logOut", disabled: true }),
    }
  );
}
