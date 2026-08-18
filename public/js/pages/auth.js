import { icon } from "../icons.js";
import { esc, homeShell } from "../ui.js";

function passwordToggle(target) {
  return `<button type="button" class="auth-password-toggle" data-action="toggle-password" data-target="${target}" aria-label="显示密码" aria-pressed="false">
    <svg class="password-eye password-eye--open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
    <svg class="password-eye password-eye--closed" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5c2.4 3 5.4 4.5 9 4.5s6.6-1.5 9-4.5"/><path d="m5.5 16.5-1.5 2M9.5 17.8 9 20M14.5 17.8l.5 2.2M18.5 16.5l1.5 2"/></svg>
  </button>`;
}

export function authPage(state) {
  const isLogin = state.authMode !== "register";
  const notice = state.authNotice || "";
  const error = state.authError || "";
  return homeShell(
    state,
    `<section class="product-auth-workspace ${isLogin ? "is-login" : "is-register"}">
      <div class="product-auth-intro">
        <div class="match-eyebrow">${isLogin ? "WELCOME BACK" : "CREATE ACCOUNT"} / PROJECT-S</div>
        <h1>${isLogin ? "回来继续摇人。" : "先成为一个玩家。"}</h1>
        <p>${isLogin ? "你的游戏身份、最近连接和匹配记录都还在这里。" : "只需要账号和密码。注册完成后，再用半分钟建立游戏身份。"}</p>
        <div class="auth-warning-rule"><span>REAL PLAYERS</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i><span>真实玩家</span></div>
      </div>
      <div class="product-auth-panel">
        <div class="product-auth-heading">
          <span>${isLogin ? "登录" : "注册"}</span>
          <div class="product-auth-tabs" role="tablist" aria-label="账号">
            <button type="button" class="${isLogin ? "is-active" : ""}" data-action="switch-auth-mode" data-value="login">登录</button>
            <button type="button" class="${!isLogin ? "is-active" : ""}" data-action="switch-auth-mode" data-value="register">注册</button>
          </div>
        </div>
        <form data-form="auth" class="product-auth-form" novalidate>
          <label class="product-auth-field" for="auth-username"><span>用户名</span><div><input id="auth-username" name="username" type="text" value="${esc(state.authUsername)}" placeholder="2-24 位字母、数字或中文" autocomplete="username" required />${icon("user", 21)}</div></label>
          <label class="product-auth-field" for="auth-password"><span>密码</span><div class="auth-password-wrap"><input id="auth-password" name="password" type="password" placeholder="${isLogin ? "输入密码" : "至少 6 位"}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />${passwordToggle("auth-password")}</div></label>
          ${isLogin ? "" : `<label class="product-auth-field" for="auth-password-confirm"><span>再次输入密码</span><div class="auth-password-wrap"><input id="auth-password-confirm" name="passwordConfirm" type="password" placeholder="再次输入相同密码" autocomplete="new-password" required />${passwordToggle("auth-password-confirm")}</div></label>`}
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="product-auth-submit-row"><p>${isLogin ? "还没有账号？" : "已经有账号？"}<button type="button" data-action="switch-auth-mode" data-value="${isLogin ? "register" : "login"}">${isLogin ? "创建一个" : "直接登录"}</button></p><button class="product-auth-submit" type="submit" data-action="auth-submit"><span>${isLogin ? "登录" : "注册"}</span>${icon("arrowRight", 19)}</button></div>
        </form>
      </div>
    </section>`,
    "auth"
  );
}
