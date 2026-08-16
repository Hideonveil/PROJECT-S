import { avatar, avatarWrap } from "../avatar.js";
import { icon } from "../icons.js";
import { esc } from "../ui.js";

export function landingPage(state = {}) {
  const user = state.user || {};
  const friends = Array.isArray(state.friends) ? state.friends.slice(0, 3) : [];
  const recent = Array.isArray(state.recentConnections) ? state.recentConnections.slice(0, 3) : [];
  const nickname = user.nickname || "访客玩家";
  const handle = user.handle || "登录后显示完整玩家身份";
  const device = user.device || "PC";
  const playStyle = user.playStyle || "还没有填写游戏偏好";
  const pool = Math.max(0, Number(state.match?.pool) || 0);
  const playing = Math.max(0, Number(state.match?.playing) || 0);
  const ribbonCycleMs = 14000;
  const ribbonPhaseMs = Date.now() % ribbonCycleMs;

  return `<main class="landing" data-page="landing">
    <div class="landing-backdrop">
    <header class="landing-header">
      <a class="landing-brand" href="#/home" aria-label="PROJECT-S 首页">
        <span class="landing-brand-mark" aria-hidden="true"><i></i></span>
        <span><strong>PROJECT-S</strong><small>此刻，一起玩</small></span>
      </a>
      <nav class="landing-auth" aria-label="账号入口">
        ${state.authenticated
          ? `<span class="landing-account-name">${esc(nickname)}</span><button type="button" class="landing-register" data-action="logout">退出</button>`
          : `<button type="button" class="landing-link" data-action="open-public-auth" data-value="login">登录</button>
             <button type="button" class="landing-register" data-action="open-public-auth" data-value="register">注册</button>`}
      </nav>
    </header>

    <section class="landing-board">
      <div class="landing-menu" aria-label="主页入口">
        <button type="button" class="landing-block landing-block--match" data-action="open-landing-match" aria-label="摇人">
          <span class="landing-block-no">01 / MATCH</span>
          <strong>摇人</strong>
        </button>
        <button type="button" class="landing-block landing-block--community" data-action="open-landing-community" aria-label="社区">
          <span class="landing-block-no">02 / COMMUNITY</span>
          <strong>社区</strong>
        </button>
        <button type="button" class="landing-block landing-block--mine" data-action="open-landing-mine" aria-label="我的">
          <span class="landing-block-no">03 / MINE</span>
          <strong>我的</strong>
        </button>
      </div>

      <div class="landing-ribbon" data-landing-ribbon aria-label="总有人想一起玩" style="--landing-ribbon-delay: -${ribbonPhaseMs}ms">
        <div class="landing-ribbon-track">
          <div class="landing-ribbon-segment"><span>总有人想一起玩</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i><span>总有人想一起玩</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i></div>
          <div class="landing-ribbon-segment" aria-hidden="true"><span>总有人想一起玩</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i><span>总有人想一起玩</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i></div>
        </div>
      </div>

      <a class="landing-contact" href="mailto:2716374688@qq.com">
        <span class="landing-block-no">PROJECT-S / CONTACT</span>
        <strong>联系我们</strong>
        <i aria-hidden="true">→</i>
      </a>
    </section>
    </div>

    <section class="landing-auth-flow" data-landing-auth-flow aria-hidden="true">
      <div class="landing-auth-blur" aria-hidden="true"></div>

      <section class="landing-auth-panel" data-landing-auth-panel aria-hidden="true">
        <button type="button" class="landing-flow-close" data-action="close-landing-auth-flow" aria-label="关闭登录注册窗口">×</button>
        <div class="landing-auth-content">
          <p class="landing-flow-kicker">PROJECT-S / ACCESS</p>
          <div class="landing-auth-mode" role="tablist" aria-label="登录或注册">
            <button type="button" data-action="switch-landing-auth-mode" data-value="login" role="tab">登录</button>
            <button type="button" data-action="switch-landing-auth-mode" data-value="register" role="tab">注册</button>
          </div>

          <div class="landing-auth-copy landing-auth-copy--login">
            <h2>回来，继续摇人。</h2>
            <p>输入账号和密码，继续使用你的玩家身份。</p>
          </div>
          <div class="landing-auth-copy landing-auth-copy--register">
            <h2>先注册，再创建玩家身份。</h2>
            <p>设置账号和密码，下一步创建玩家身份。</p>
          </div>

          <div class="landing-auth-fields landing-auth-fields--login-account">
            <label for="landing-login-account">账号</label>
            <input id="landing-login-account" type="text" placeholder="请输入账号" autocomplete="username" />
            <label for="landing-login-password">密码</label>
            <input id="landing-login-password" type="password" placeholder="请输入密码" autocomplete="current-password" />
          </div>
          <div class="landing-auth-fields landing-auth-fields--register-account">
            <label for="landing-register-account">账号</label>
            <input id="landing-register-account" type="text" placeholder="设置账号" autocomplete="username" />
            <label for="landing-register-password">密码</label>
            <input id="landing-register-password" type="password" placeholder="至少 6 位" autocomplete="new-password" />
            <label for="landing-register-password-confirm">确认密码</label>
            <input id="landing-register-password-confirm" type="password" placeholder="再次输入密码" autocomplete="new-password" />
          </div>

          <button type="button" class="landing-auth-submit landing-auth-submit--login" data-action="submit-landing-auth" data-value="login">
            <span>登录</span><i aria-hidden="true">↓</i>
          </button>
          <button type="button" class="landing-auth-submit landing-auth-submit--register" data-action="submit-landing-auth" data-value="register">
            <span>继续创建玩家身份</span><i aria-hidden="true">↙</i>
          </button>
          <p class="landing-auth-preview-note" data-landing-auth-status>账号信息会安全提交到 PROJECT-S。</p>
        </div>
      </section>

      <section class="landing-identity-panel" data-landing-identity-panel aria-hidden="true">
        <button type="button" class="landing-flow-close landing-identity-close" data-action="close-landing-auth-flow" aria-label="关闭创建身份窗口">×</button>
        <div class="landing-identity-content">
          <p class="landing-flow-kicker">PROJECT-S / PLAYER ID</p>
          <h2>创建玩家身份</h2>
          <p class="landing-identity-intro">只选择匹配需要的信息。</p>

          <div class="landing-identity-grid">
            <label class="landing-identity-name" for="landing-profile-nickname">
              <span>昵称</span>
              <input id="landing-profile-nickname" type="text" maxlength="12" placeholder="队友会这样称呼你" autocomplete="nickname" />
            </label>
            <fieldset class="landing-identity-group landing-identity-avatar" data-landing-profile-group="avatar">
              <legend>头像</legend>
              <div class="landing-identity-options">
                ${[1, 2, 3, 4]
                  .map(
                    (index) => `<button type="button" class="${index === 1 ? "is-selected" : ""}" data-action="select-landing-profile-option" data-value="me-${index}" aria-pressed="${index === 1}">${avatar(`me-${index}`, 52)}</button>`
                  )
                  .join("")}
              </div>
            </fieldset>

            <fieldset class="landing-identity-group" data-landing-profile-group="gender">
              <legend>性别</legend>
              <div class="landing-identity-options">
                <button type="button" class="is-selected" data-action="select-landing-profile-option" data-value="保密" aria-pressed="true">保密</button>
                <button type="button" data-action="select-landing-profile-option" data-value="男" aria-pressed="false">男</button>
                <button type="button" data-action="select-landing-profile-option" data-value="女" aria-pressed="false">女</button>
              </div>
            </fieldset>

            <fieldset class="landing-identity-group" data-landing-profile-group="age">
              <legend>年龄</legend>
              <div class="landing-identity-options">
                <button type="button" data-action="select-landing-profile-option" data-value="18-22" aria-pressed="false">18–22</button>
                <button type="button" class="is-selected" data-action="select-landing-profile-option" data-value="23-29" aria-pressed="true">23–29</button>
                <button type="button" data-action="select-landing-profile-option" data-value="30+" aria-pressed="false">30+</button>
              </div>
            </fieldset>

            <fieldset class="landing-identity-group" data-landing-profile-group="device">
              <legend>设备</legend>
              <div class="landing-identity-options">
                <button type="button" class="is-selected" data-action="select-landing-profile-option" data-value="PC" aria-pressed="true">PC</button>
                <button type="button" data-action="select-landing-profile-option" data-value="PlayStation" aria-pressed="false">PS</button>
                <button type="button" data-action="select-landing-profile-option" data-value="Xbox" aria-pressed="false">Xbox</button>
                <button type="button" data-action="select-landing-profile-option" data-value="Switch" aria-pressed="false">Switch</button>
              </div>
            </fieldset>

            <fieldset class="landing-identity-group landing-identity-games" data-landing-profile-group="games" data-multiple="true">
              <legend>爱好游戏类型</legend>
              <div class="landing-identity-options">
                ${["FPS", "MOBA", "沙盒", "生存", "模拟", "休闲"]
                  .map(
                    (genre, index) => `<button type="button" class="${index < 2 ? "is-selected" : ""}" data-action="select-landing-profile-option" data-value="${genre}" aria-pressed="${index < 2}">${genre}</button>`
                  )
                  .join("")}
              </div>
            </fieldset>
          </div>

          <button type="button" class="landing-identity-complete" data-action="complete-landing-profile">
            <span>完成</span><i aria-hidden="true">→</i>
          </button>
          <p class="landing-auth-preview-note" data-landing-profile-status>完成后会保存为你的真实玩家身份。</p>
        </div>
      </section>
    </section>

    <section class="landing-match-layer" data-landing-match data-landing-dismiss="match" aria-hidden="true">
      <div class="landing-match-surface">
        <button type="button" class="landing-match-close" data-action="close-landing-match" aria-label="关闭匹配筛选">×</button>
        <div class="landing-match-content">
          <p class="landing-match-kicker">01 / MATCH FILTER</p>
          <h2>这次，想怎么玩？</h2>
          <p class="landing-match-intro">选好这一次的需求，再去找到现在就能一起的人。</p>

          <div class="landing-match-filters">
            <fieldset class="landing-match-group" data-landing-filter-group="game">
              <legend>选择游戏</legend>
              <div class="landing-match-options">
                <button type="button" class="is-selected" data-action="landing-match-option" data-value="minecraft" aria-pressed="true">Minecraft</button>
                <button type="button" data-action="landing-match-option" data-value="deadlock" aria-pressed="false">Deadlock</button>
                <button type="button" data-action="landing-match-option" data-value="stardew" aria-pressed="false">Stardew Valley</button>
                <button type="button" data-action="landing-match-option" data-value="pubg" aria-pressed="false">PUBG</button>
              </div>
            </fieldset>

            <fieldset class="landing-match-group" data-landing-filter-group="mode">
              <legend>这次想怎么玩</legend>
              <div class="landing-match-options">
                <button type="button" class="is-selected" data-action="landing-match-option" data-value="轻松玩" aria-pressed="true">轻松玩</button>
                <button type="button" data-action="landing-match-option" data-value="认真上分" aria-pressed="false">认真上分</button>
                <button type="button" data-action="landing-match-option" data-value="都可以" aria-pressed="false">都可以</button>
              </div>
            </fieldset>

            <fieldset class="landing-match-group" data-landing-filter-group="time">
              <legend>什么时候玩</legend>
              <div class="landing-match-options">
                <button type="button" class="is-selected" data-action="landing-match-option" data-value="现在" aria-pressed="true">现在</button>
                <button type="button" data-action="landing-match-option" data-value="30分钟后" aria-pressed="false">30分钟后</button>
                <button type="button" data-action="landing-match-option" data-value="晚些时候" aria-pressed="false">晚些时候</button>
              </div>
            </fieldset>

            <fieldset class="landing-match-group" data-landing-filter-group="team">
              <legend>还需要几个人</legend>
              <div class="landing-match-options">
                <button type="button" class="is-selected" data-action="landing-match-option" data-value="1" aria-pressed="true">1 人</button>
                <button type="button" data-action="landing-match-option" data-value="2" aria-pressed="false">2 人</button>
                <button type="button" data-action="landing-match-option" data-value="3" aria-pressed="false">3 人</button>
                <button type="button" data-action="landing-match-option" data-value="4" aria-pressed="false">4 人+</button>
              </div>
            </fieldset>

            <fieldset class="landing-match-group" data-landing-filter-group="voice">
              <legend>是否语音</legend>
              <div class="landing-match-options">
                <button type="button" class="is-selected" data-action="landing-match-option" data-value="需要" aria-pressed="true">需要</button>
                <button type="button" data-action="landing-match-option" data-value="不需要" aria-pressed="false">不需要</button>
                <button type="button" data-action="landing-match-option" data-value="都可以" aria-pressed="false">都可以</button>
              </div>
            </fieldset>
          </div>
        </div>

        <button type="button" class="landing-match-submit" data-action="landing-match-submit">
          <span>摇人</span><i aria-hidden="true">↗</i>
        </button>

        <section class="landing-visual-match" data-landing-visual-match aria-hidden="true" aria-label="正在匹配">
          <div class="landing-visual-match-center">
            <div class="landing-visual-controller" aria-hidden="true">${icon("gamepad2", 112)}</div>
            <p>PROJECT-S / MATCHING</p>
            <h2>正在摇人</h2>
          </div>

          <div class="landing-visual-match-footer">
            <div class="landing-visual-stats" aria-label="当前在线数据">
              <div><strong data-landing-visual-pool>${pool}</strong><span>匹配池人数</span></div>
              <div><strong data-landing-visual-playing>${playing}</strong><span>正在游戏</span></div>
            </div>

            <div class="landing-visual-summary" aria-label="本次匹配需求">
              <p>这次想找</p>
              <div>
                <span data-landing-summary="game">Minecraft</span>
                <span data-landing-summary="mode">轻松玩</span>
                <span data-landing-summary="time">现在</span>
                <span data-landing-summary="team">1 人</span>
                <span data-landing-summary="voice">需要</span>
              </div>
            </div>

            <button type="button" class="landing-visual-exit" data-action="exit-landing-visual-match">退出匹配</button>
          </div>
        </section>
      </div>
    </section>

    <section class="landing-community-layer" data-landing-community data-landing-dismiss="community" aria-hidden="true">
      <div class="landing-community-surface">
        <button type="button" class="landing-community-close" data-action="close-landing-community" aria-label="关闭社区">×</button>
        <div class="landing-community-copy">
          <strong>社区</strong>
          <span class="landing-community-status">COMING SOON</span>
        </div>
      </div>
    </section>

    <section class="landing-mine-layer" data-landing-mine data-landing-dismiss="mine" aria-hidden="true">
      <div class="landing-mine-surface">
        <svg class="landing-mine-outline landing-mine-outline--desktop" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polygon points="0,39 39,0 100,0 100,61 61,100 0,100"></polygon>
        </svg>
        <svg class="landing-mine-outline landing-mine-outline--mobile" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polygon points="0,22 22,0 100,0 100,78 78,100 0,100"></polygon>
        </svg>
        <button type="button" class="landing-mine-close" data-action="close-landing-mine" aria-label="关闭我的">×</button>

        <section class="landing-mine-profile">
          <p class="landing-mine-kicker">03 / MINE</p>
          <h2>基本信息</h2>
          <div class="landing-mine-identity">
            ${avatarWrap(user.avatarKey || "me-1", 78, user.online ?? false)}
            <div>
              <strong>${esc(nickname)}</strong>
              <span>${esc(handle)}</span>
            </div>
          </div>
          <div class="landing-mine-meta">
            <span>${esc(device)}</span>
            <span>${user.voice ? "可以语音" : "暂不开麦"}</span>
          </div>
          <p class="landing-mine-style">${esc(playStyle)}</p>
        </section>

        <div class="landing-mine-connections">
          <section class="landing-mine-list">
            <div class="landing-mine-list-head"><h3>朋友</h3><span>${friends.length}</span></div>
            ${
              friends.length
                ? friends
                    .map(
                      (friend) => `<div class="landing-mine-person">
                        ${avatarWrap(friend.avatarKey || "node", 42, friend.online ?? false)}
                        <div><strong>${esc(friend.name || friend.nickname || "玩家")}</strong><span>${esc(friend.lastGame || friend.device || "一起玩过")}</span></div>
                      </div>`
                    )
                    .join("")
                : `<p class="landing-mine-empty">还没有朋友</p>`
            }
          </section>

          <section class="landing-mine-list">
            <div class="landing-mine-list-head"><h3>最近匹配的人</h3><span>${recent.length}</span></div>
            ${
              recent.length
                ? recent
                    .map(
                      (person) => `<div class="landing-mine-person">
                        ${avatarWrap(person.avatarKey || "node", 42, person.online ?? false)}
                        <div><strong>${esc(person.name || "玩家")}</strong><span>${esc(person.gameName || "刚刚一起玩过")}</span></div>
                      </div>`
                    )
                    .join("")
                : `<p class="landing-mine-empty">还没有最近匹配</p>`
            }
          </section>
        </div>
      </div>
    </section>
  </main>`;
}
