import { icon } from "../icons.js";
import { brandMark, esc } from "../ui.js";

function accountActions(state) {
  if (!state.authenticated) {
    return `<div class="landing-auth">
      <button type="button" data-action="open-auth-login">登录</button>
      <button class="landing-register" type="button" data-action="open-auth-register">注册</button>
    </div>`;
  }
  return `<div class="landing-auth landing-auth--signed">
    <button type="button" data-action="go-me"><span>${esc(state.user.nickname)}</span><small>${esc(state.user.handle || state.user.friendCode || state.user.id || "PLAYER")}</small></button>
    <button type="button" data-action="logout">登出</button>
  </div>`;
}

export function landingPage(state) {
  const pool = Math.max(0, Number(state.match?.pool || 0));
  const warningText = "总有人想一起玩　/　NEVER PLAY ALONE　/　".repeat(8);
  const liveCopy = pool ? `${pool} 人正在摇人` : "正在等待下一位玩家";

  return `<div class="landing-shell">
    <header class="landing-header">
      <a class="landing-brand" href="#/hero" aria-label="“机”缘首页">${brandMark(44)}<strong>“机”缘</strong></a>
      ${accountActions(state)}
    </header>

    <main class="landing-main">
      <section class="landing-hero" aria-labelledby="landing-title">
        <div class="landing-copy">
          <div class="landing-live"><i></i><span id="hero-online-count">${esc(liveCopy)}</span><b>LIVE MATCH POOL</b></div>
          <h1 id="landing-title"><span>总有人想</span><strong>一起玩。</strong></h1>
          <p>现在想玩什么，就去找到同一时刻也想玩的人。</p>
          <button class="landing-scroll-cue" type="button" data-action="scroll-landing-more">继续了解 ${icon("arrowRight", 16)}</button>
        </div>

        <button class="landing-match" type="button" data-action="enter-match" aria-label="进入摇人匹配">
          <span class="landing-match-code">“机”缘 / MATCH</span>
          <strong>摇人</strong>
          <span class="landing-match-action">进入匹配 ${icon("arrowRight", 28)}</span>
          <i aria-hidden="true"></i>
        </button>
      </section>

      <section class="landing-more" id="landing-more" aria-label="关于“机”缘">
        <div class="landing-statement"><span>不是随机遇见。</span><strong>是此刻刚好都想玩。</strong></div>
        <div class="landing-lower-grid">
          <button class="landing-contact" type="button" data-action="open-feedback"><span>联系我们</span><small>建议、合作或一起完善“机”缘</small>${icon("arrowRight", 24)}</button>
          <div class="landing-reserved" aria-label="后续内容预留"><span>“机”缘 / NEXT</span><i></i><i></i></div>
        </div>
      </section>
    </main>

    <div class="product-ticker landing-ticker" data-product-ticker aria-label="总有人想一起玩">
      <div class="product-ticker-track" data-ticker-track aria-hidden="true">
        <span class="product-ticker-text" data-ticker-head>${warningText}</span>
        <span class="product-ticker-text" data-ticker-tail>${warningText}</span>
      </div>
    </div>

    <section class="pc-only-gate" role="dialog" aria-modal="true" aria-labelledby="pc-only-title">
      <div class="pc-only-card"><div class="pc-only-mark">${brandMark(58)}</div><div class="match-eyebrow">PC EXPERIENCE / “机”缘</div><h1 id="pc-only-title">请使用电脑打开</h1><p>“机”缘当前只开放 PC 版。用电脑浏览器进入，才能完整使用摇人、匹配与 Session 房间。</p><div class="pc-only-device">${icon("monitor", 30)}<span><b>推荐设备</b><small>Windows / macOS · Chrome / Edge</small></span></div></div>
      <div class="pc-only-warning"><span>总有人想一起玩</span><i>/</i><b>NEVER PLAY ALONE</b><i>/</i></div>
    </section>
  </div>`;
}
