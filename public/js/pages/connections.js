import { icon } from "../icons.js";
import { avatarWrap } from "../avatar.js";
import { button, esc, homeShell } from "../ui.js";

function timeLabel(value) {
  if (!value) return "刚刚一起玩";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60 * 60 * 1000) return "刚刚一起玩";
  const d = new Date(value);
  return `${d.getMonth() + 1}月${d.getDate()}日 一起玩`;
}

function ratingLabel(value) {
  if (value === "happy") return "很开心";
  if (value === "meh") return "一般";
  if (value === "bad") return "不太顺利";
  return "";
}

export function connectionsPage(state) {
  const list = state.recentConnections || [];

  return homeShell(
    state,
    `<div class="prism-page prism-connections">
      <div class="prism-head">
        <div>
          <div class="prism-eyebrow"><i></i>最近连接</div>
          <h1 class="prism-title">最近一起玩过的人</h1>
          <p class="prism-sub">这里只记录真实一起玩过的局，方便你再次找到对方。不是永久好友。</p>
        </div>
        <span class="section-note">${list.length} 条记录</span>
      </div>
      <section class="prism-section">
        <div class="section-head">
          <h2 class="section-title">最近连接</h2>
          <span class="section-note">${list.length} 条记录</span>
        </div>
        ${list.length === 0
          ? `<div class="empty-state">
              ${icon("clock", 30)}
              <strong>还没有一起玩过的人</strong>
              <span>完成一次匹配并一起玩过，就会出现在这里。</span>
              ${button({ label: "开始匹配", action: "go-need", kind: "primary", iconName: "gamepad2" })}
            </div>`
          : `<div class="friends-list">
              ${list
                .map(
                  (c) => `<div class="friend-row">
                    <div class="friend-main">
                      ${avatarWrap(c.avatarKey, 56, c.online)}
                      <div class="friend-meta">
                        <div class="friend-name">${esc(c.name)}</div>
                        <div class="friend-last">${esc(c.gameName || "游戏")} · ${esc(timeLabel(c.playedAt))} · 一起玩过 ${c.playCount || 1} 次</div>
                        ${c.rating ? `<div class="friend-last">这次：${esc(ratingLabel(c.rating))}</div>` : ""}
                      </div>
                    </div>
                    <div class="inline-actions">
                      ${button({ label: "查看主页", action: "view-profile", value: c.id, kind: "outline", size: "sm", iconName: "user" })}
                      ${button({ label: "再次匹配", action: "rematch-recent", value: c.id, kind: "primary", size: "sm", iconName: "refreshCw" })}
                    </div>
                  </div>`
                )
                .join("")}
            </div>`}
      </section>
    </div>`,
    "connections"
  );
}
