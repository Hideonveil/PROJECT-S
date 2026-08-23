import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";

function passwordToggle(target) {
  return `<button type="button" class="auth-password-toggle" data-action="toggle-password" data-target="${target}" aria-label="显示密码" aria-pressed="false">
    <svg class="password-eye password-eye--open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
    <svg class="password-eye password-eye--closed" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5c2.4 3 5.4 4.5 9 4.5s6.6-1.5 9-4.5"/><path d="m5.5 16.5-1.5 2M9.5 17.8 9 20M14.5 17.8l.5 2.2M18.5 16.5l1.5 2"/></svg>
  </button>`;
}

export function authPage(state) {
  const verification = state.authVerification;
  if (verification?.email) {
    const notice = state.authNotice || "";
    const error = state.authError || "";
    return homeShell(
      state,
      `<section class="product-auth-workspace is-register" data-auth-workspace>
        <div class="product-auth-intro">
          <div class="match-eyebrow">PLAYER ACCESS / “机”缘</div>
          <h1>再确认一下邮箱。</h1>
          <p>我们已经把 6 位验证码发到你的邮箱。完成验证后，就可以用用户名或邮箱登录。</p>
          <div class="auth-warning-rule"><span>REAL PLAYERS</span><i>/</i><span>CHECK YOUR INBOX</span><i>/</i><span>真实玩家</span></div>
        </div>
        <div class="product-auth-panel">
          <div class="product-auth-heading">
            <span>验证邮箱</span>
          </div>
          <form data-form="auth-verify" class="product-auth-form" novalidate>
            <p class="auth-verification-copy">验证码已发送至 <strong>${esc(verification.email)}</strong></p>
            <label class="product-auth-field auth-otp-field" for="auth-otp"><span>邮箱验证码</span><div><input id="auth-otp" name="token" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="输入 6 位数字" required />${icon("mail", 21)}</div></label>
            ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
            ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
            <div class="product-auth-submit-row"><p data-auth-switch-copy><span>没收到验证码？</span><button type="button" data-action="resend-verification">重新发送</button></p><button class="product-auth-submit" type="submit" data-action="verify-email"><span>验证邮箱</span>${icon("arrowRight", 19)}</button></div>
            <button class="auth-verification-back" type="button" data-action="cancel-email-verification">返回登录</button>
          </form>
        </div>
      </section>`,
      "auth"
    );
  }
  if (state.authMode === "forgot") {
    const notice = state.authNotice || "";
    const error = state.authError || "";
    return homeShell(
      state,
      `<section class="product-auth-workspace is-login" data-auth-workspace>
        <div class="product-auth-intro">
          <div class="match-eyebrow">PLAYER ACCESS / “机”缘</div>
          <h1>把密码找回来。</h1>
          <p>输入注册时使用的邮箱，我们会发送一封密码重置邮件。</p>
          <div class="auth-warning-rule"><span>REAL PLAYERS</span><i>/</i><span>CHECK YOUR INBOX</span><i>/</i><span>找回密码</span></div>
        </div>
        <div class="product-auth-panel">
          <div class="product-auth-heading"><span>找回密码</span></div>
          <form data-form="auth-forgot" class="product-auth-form product-auth-form--simple" novalidate>
            <label class="product-auth-field" for="auth-forgot-email"><span>注册邮箱</span><div><input id="auth-forgot-email" name="email" type="email" value="${esc(state.authEmail || "")}" placeholder="输入注册时使用的邮箱" autocomplete="email" required />${icon("mail", 21)}</div></label>
            ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
            ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
            <div class="product-auth-submit-row"><button type="button" class="auth-verification-back" data-action="back-to-login">返回登录</button><button class="product-auth-submit" type="submit" data-action="submit-forgot-password"><span>发送重置邮件</span>${icon("arrowRight", 19)}</button></div>
          </form>
        </div>
      </section>`,
      "auth"
    );
  }
  if (state.authMode === "reset") {
    const notice = state.authNotice || "";
    const error = state.authError || "";
    return homeShell(
      state,
      `<section class="product-auth-workspace is-login" data-auth-workspace>
        <div class="product-auth-intro">
          <div class="match-eyebrow">PLAYER ACCESS / “机”缘</div>
          <h1>设置一个新密码。</h1>
          <p>新密码至少 6 位。保存后，请用新密码重新登录。</p>
          <div class="auth-warning-rule"><span>REAL PLAYERS</span><i>/</i><span>NEW PASSWORD</span><i>/</i><span>重新开始</span></div>
        </div>
        <div class="product-auth-panel">
          <div class="product-auth-heading"><span>重置密码</span></div>
          <form data-form="auth-reset" class="product-auth-form product-auth-form--simple" novalidate>
            <label class="product-auth-field" for="auth-reset-password"><span>新密码</span><div class="auth-password-wrap"><input id="auth-reset-password" name="password" type="password" placeholder="至少 6 位" autocomplete="new-password" required />${passwordToggle("auth-reset-password")}</div></label>
            <label class="product-auth-field" for="auth-reset-confirm"><span>再次输入密码</span><div class="auth-password-wrap"><input id="auth-reset-confirm" name="passwordConfirm" type="password" placeholder="再次输入相同密码" autocomplete="new-password" required />${passwordToggle("auth-reset-confirm")}</div></label>
            ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
            ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
            <div class="product-auth-submit-row"><button type="button" class="auth-verification-back" data-action="back-to-login">返回登录</button><button class="product-auth-submit" type="submit" data-action="submit-password-reset"><span>保存新密码</span>${icon("arrowRight", 19)}</button></div>
          </form>
        </div>
      </section>`,
      "auth"
    );
  }
  const isLogin = state.authMode !== "register";
  const notice = state.authNotice || "";
  const error = state.authError || "";
  return homeShell(
    state,
    `<section class="product-auth-workspace ${isLogin ? "is-login" : "is-register"}" data-auth-workspace>
      <div class="product-auth-intro">
        <div class="match-eyebrow">PLAYER ACCESS / “机”缘</div>
        <h1>回来继续摇人。</h1>
        <p>登录或创建账号，都从这里进入。你的游戏身份、最近连接和匹配记录会留在同一个地方。</p>
        <div class="auth-warning-rule"><span>REAL PLAYERS</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i><span>真实玩家</span></div>
      </div>
      <div class="product-auth-panel">
        <div class="product-auth-heading">
          <span data-auth-mode-title>${isLogin ? "登录" : "注册"}</span>
          <div class="product-auth-tabs" role="tablist" aria-label="账号">
            <i class="product-auth-tab-indicator" aria-hidden="true"></i>
            <button type="button" role="tab" aria-selected="${isLogin}" class="${isLogin ? "is-active" : ""}" data-action="switch-auth-mode" data-value="login">登录</button>
            <button type="button" role="tab" aria-selected="${!isLogin}" class="${!isLogin ? "is-active" : ""}" data-action="switch-auth-mode" data-value="register">注册</button>
          </div>
        </div>
        <form data-form="auth" class="product-auth-form" novalidate>
          <label class="product-auth-field" for="auth-identifier"><span data-auth-identifier-label>${isLogin ? "用户名或邮箱" : "用户名"}</span><div><input id="auth-identifier" name="identifier" type="text" value="${esc(state.authUsername)}" placeholder="${isLogin ? "输入用户名或邮箱" : "2-24 位字母、数字或中文"}" autocomplete="username" required />${icon("user", 21)}</div></label>
          <label class="product-auth-field auth-email-slot" for="auth-email" aria-hidden="${isLogin}"><span>邮箱</span><div><input id="auth-email" name="email" type="email" value="${esc(state.authEmail || "")}" placeholder="用于验证和找回密码" autocomplete="email" required ${isLogin ? "disabled" : ""} />${icon("mail", 21)}</div></label>
          <label class="product-auth-field" for="auth-password"><span>密码</span><div class="auth-password-wrap"><input id="auth-password" name="password" type="password" placeholder="${isLogin ? "输入密码" : "至少 6 位"}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />${passwordToggle("auth-password")}</div></label>
          ${isLogin ? `<div class="auth-forgot-row"><button type="button" class="auth-forgot-link" data-action="forgot-password">忘记密码？</button></div>` : ""}
          <label class="product-auth-field auth-confirm-slot" for="auth-password-confirm" aria-hidden="${isLogin}"><span>再次输入密码</span><div class="auth-password-wrap"><input id="auth-password-confirm" name="passwordConfirm" type="password" placeholder="再次输入相同密码" autocomplete="new-password" required ${isLogin ? "disabled" : ""} />${passwordToggle("auth-password-confirm")}</div></label>
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="product-auth-submit-row"><p data-auth-switch-copy><span>${isLogin ? "还没有账号？" : "已经有账号？"}</span><button type="button" data-action="switch-auth-mode" data-value="${isLogin ? "register" : "login"}">${isLogin ? "创建一个" : "直接登录"}</button></p><button class="product-auth-submit" type="submit" data-action="auth-submit"><span data-auth-submit-label>${isLogin ? "登录" : "注册"}</span>${icon("arrowRight", 19)}</button></div>
        </form>
      </div>
    </section>`,
    "auth"
  );
}
