import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, shell, statBlock, statusPill } from "../ui.js";


export function mePage(state) {
  const user = state.user;
  const stats = state.stats || { sessions: 0, connected: 0, hours: 0 };
  const friendCode = user.friendCode || "NODE-XXXX-XXXX";
  const genres = user.genres || [];
  const genreTags = genres.length
    ? `<div class="chip-group">${genres.map((g) => `<span class="chip chip--on">${esc(g)}</span>`).join("")}</div>`
    : `<span class="dim" style="font-size:13px">未填写常玩游戏类型</span>`;

  return shell(
    state,
    "me",
    `<div class="page">
      <div class="page-head">
        <div class="page-eyebrow">${icon("user", 13)} 我的</div>
        <h1 class="page-title">游戏身份</h1>
        <p class="page-sub">这里只有匹配需要的信息：你是谁、玩什么、怎么玩。</p>
      </div>
      <section class="me-profile">
        <div class="card card--pad-lg">
          <div class="profile-identity">
            ${avatarWrap(user.avatarKey, 88, user.online)}
            <div style="min-width:0;flex:1">
              <div class="profile-name"><h1>${esc(user.nickname)}</h1>${statusPill("LIVE")}</div>
              <div class="profile-handle">${esc(user.handle)}</div>
              <div class="profile-meta" style="margin-top:10px">
                <span class="reason-tag reason-tag--neutral">${icon("monitor", 13)} ${esc(user.device)}</span>
                <span class="reason-tag reason-tag--neutral">${user.voice ? icon("mic", 13) + " 开麦" : icon("volumeX", 13) + " 闭麦"}</span>
              </div>
            </div>
            <div class="inline-actions">
              ${button({ label: "编辑身份", action: "open-profile-edit", kind: "outline", size: "sm", iconName: "pencil" })}
              ${button({ label: "退出登录", action: "logout", kind: "danger", size: "sm", iconName: "logOut" })}
            </div>
          </div>
        </div>

        <div class="me-stats">
          <div class="card">${statBlock("已完成局数", stats.sessions)}</div>
          <div class="card">${statBlock("保留连接", stats.connected, { signal: true })}</div>
          <div class="card">${statBlock("累计时长", `${stats.hours}h`)}</div>
        </div>

        <div class="grid-2">
          <div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="card-title">我的好友代码</div>
            <div class="inline-actions">
              <span class="room-code" style="font-size:15px">${esc(friendCode)}</span>
              ${button({ label: "复制", action: "copy-code", value: friendCode, kind: "outline", size: "sm", iconName: "copy" })}
            </div>
            <p class="muted" style="font-size:12px">朋友在好友页输入这个代码，就能把你加为搭子。</p>
          </div>
          <div class="card" style="display:flex;flex-direction:column;gap:12px">
            <div class="card-title">反馈与支持</div>
            <p class="dim" style="font-size:13px">发现 Bug 或有功能建议，直接提交给我。</p>
            ${button({ label: "提交反馈", action: "open-feedback", kind: "outline", iconName: "send" })}
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title" style="margin-bottom:4px">常玩游戏类型</div>
            ${genreTags}
          </div>
          <div class="card">
            <div class="card-title" style="margin-bottom:10px">匹配记录</div>
            ${
              state.history.length === 0
                ? `<div class="empty-state" style="padding:24px 16px"><strong>还没有记录</strong><span>完成第一局后会显示在这里。</span></div>`
                : `<div class="history-list">${state.history
                    .slice(0, 6)
                    .map(
                      (h) => `<div class="history-row">
                        <div class="history-main"><span class="history-title">${esc(h.title)}</span><span class="history-sub">${esc(h.partnerName)} · ${esc(h.time)}</span></div>
                        <span class="history-result">${esc(h.result)}</span>
                      </div>`
                    )
                    .join("")}</div>`
            }
          </div>
        </div>
      </section>
    </div>`
  );
}
