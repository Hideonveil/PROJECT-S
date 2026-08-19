import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell, statusPill } from "../ui.js";

export function friendsPage(state) {
  const friends = state.friends || [];
  const myCode = state.user?.friendCode || "NODE-XXXX-XXXX";
  const searchResult = state.friendSearchResult;
  const alreadyFriend = searchResult && friends.some((f) => f.id === searchResult.id);
  const searching = state.friendSearchStatus === "searching";
  const adding = state.friendSearchStatus === "adding";
  const incoming = state.friendRequests?.incoming || [];
  const outgoing = state.friendRequests?.outgoing || [];
  const pendingFriend = searchResult && outgoing.some((request) => request.user?.id === searchResult.id);

  return homeShell(
    state,
    `<div class="prism-page prism-friends">
      <div class="prism-head">
        <div>
          <div class="prism-eyebrow"><i></i>好友与搭子</div>
          <h1 class="prism-title">一起玩过，还想再玩的人</h1>
          <p class="prism-sub">每条连接都来自一局真实的游戏和一次双向选择；也支持直接用好友代码添加。</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="prism-card" style="display:flex;flex-direction:column;gap:12px">
          <div class="card-title">我的好友代码</div>
          <div class="inline-actions">
            <span class="room-code" style="font-size:15px">${esc(myCode)}</span>
            ${button({ label: "复制", action: "copy-code", value: myCode, kind: "outline", size: "sm", iconName: "copy" })}
          </div>
          <p class="muted" style="font-size:12px">把这个代码发给朋友，对方在搜索框输入后就能添加你。</p>
        </div>

        <div class="prism-card" style="display:flex;flex-direction:column;gap:12px">
          <div class="card-title">按代码搜索</div>
          <div class="inline-actions" style="width:100%">
            <input class="input" id="friend-code-input" value="${esc(state.friendSearchCode || "")}" placeholder="NODE-XXXX-XXXX" style="flex:1;min-width:180px" ${searching || adding ? "disabled" : ""} />
            ${button({ label: searching ? "搜索中…" : "搜索", action: "search-friend", kind: "primary", iconName: "search", disabled: searching || adding })}
          </div>
          ${state.friendSearchError ? `<p class="form-error" role="alert">${esc(state.friendSearchError)}</p>` : ""}
        </div>
      </div>

      ${
        searchResult
          ? `<div class="prism-card prism-search-result">
              <div class="friend-row" style="border:0;background:transparent;padding:0">
                <div class="friend-main">
                  ${avatarWrap(searchResult.avatarKey, 56, searchResult.online)}
                  <div class="friend-meta">
                    <div class="friend-name">${esc(searchResult.nickname || searchResult.name)}</div>
                    <div class="friend-last">${esc(searchResult.device || "PC")} · ${esc(searchResult.friendCode || "")}</div>
                  </div>
                </div>
                ${
                  alreadyFriend
                    ? statusPill("CONNECTED")
                    : pendingFriend
                      ? `<span class="connection-friend-state">${icon("clock", 16)}好友申请待确认</span>`
                    : button({ label: adding ? "添加中…" : "添加好友", action: "add-friend", value: searchResult.id, kind: "primary", iconName: "userPlus", disabled: adding })
                }
              </div>
            </div>`
          : ""
      }

      ${incoming.length ? `<section class="prism-section">
        <div class="section-head"><h2 class="section-title">待确认的好友申请</h2><span class="section-note">${incoming.length} 个</span></div>
        <div class="friends-list">${incoming.map(({ user }) => `<div class="friend-row">
          <div class="friend-main">${avatarWrap(user.avatarKey, 52, user.online)}<div class="friend-meta"><div class="friend-name">${esc(user.name || user.nickname)}</div><div class="friend-last">想添加你为机缘好友</div></div></div>
          <div class="inline-actions">${button({ label: "接受", action: "accept-friend", value: user.id, kind: "primary", size: "sm", iconName: "check" })}${button({ label: "拒绝", action: "reject-friend", value: user.id, kind: "ghost", size: "sm", iconName: "x" })}</div>
        </div>`).join("")}</div>
      </section>` : ""}

      ${outgoing.length ? `<p class="muted" style="font-size:12px">${outgoing.length} 个好友申请正在等待对方确认。</p>` : ""}

      <section class="prism-section">
        <div class="section-head">
          <h2 class="section-title">朋友列表</h2>
          <span class="section-note">${friends.length} 个连接</span>
        </div>
        ${
          friends.length === 0
            ? `<div class="empty-state">
                ${icon("users", 30)}
                <strong>还没有朋友</strong>
                <span>可以在上方输入好友代码，或在匹配房间中把对方添加为机缘好友。</span>
              </div>`
            : `<div class="friends-list">
                ${friends
                  .map(
                    (f) => `<div class="friend-row">
                      <div class="friend-main">
                        ${avatarWrap(f.avatarKey, 56, f.online)}
                        <div class="friend-meta">
                          <div class="friend-name">${esc(f.name)}</div>
                          <div class="friend-last">上次一起 · ${esc(f.lastGame || "未知游戏")} · ${esc(f.lastTime || "")}</div>
                        </div>
                      </div>
                      <div class="inline-actions">${f.online ? statusPill("LIVE") : statusPill("OFFLINE")}</div>
                    </div>`
                  )
                  .join("")}
              </div>`
        }
      </section>
    </div>`,
    "friends"
  );
}
