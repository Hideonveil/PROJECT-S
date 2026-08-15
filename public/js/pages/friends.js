import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell, statusPill } from "../ui.js";

export function friendsPage(state) {
  const friends = state.friends || [];
  const myCode = state.user?.friendCode || "NODE-XXXX-XXXX";
  const searchResult = state.friendSearchResult;
  const alreadyFriend = searchResult && friends.some((f) => f.id === searchResult.id);

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
            <input class="input" id="friend-code-input" placeholder="NODE-XXXX-XXXX" style="flex:1;min-width:180px" />
            ${button({ label: "搜索", action: "search-friend", kind: "primary", iconName: "search" })}
          </div>
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
                    : button({ label: "添加好友", action: "add-friend-by-code", value: searchResult.friendCode, kind: "primary", iconName: "userPlus" })
                }
              </div>
            </div>`
          : ""
      }

      <section class="prism-section">
        <div class="section-head">
          <h2 class="section-title">搭子列表</h2>
          <span class="section-note">${friends.length} 个连接</span>
        </div>
        ${
          friends.length === 0
            ? `<div class="empty-state">
                ${icon("users", 30)}
                <strong>还没有搭子</strong>
                <span>完成一次匹配，游戏结束后双方都选择「再玩一局」，或直接用好友代码添加。</span>
                ${button({ label: "开始匹配", action: "go-need", kind: "primary", iconName: "gamepad2" })}
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
                      <div class="inline-actions">
                        ${f.online ? statusPill("LIVE") : statusPill("OFFLINE")}
                        ${button({ label: "再次一起玩", action: "rematch-friend", value: f.id, kind: "primary", size: "sm", iconName: "gamepad2" })}
                      </div>
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
