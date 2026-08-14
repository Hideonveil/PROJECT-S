import { button, esc, mirrors } from "../ui.js";
import { welcomeHero } from "./welcome.js";

export function authPage(state) {
  const isLogin = state.authMode !== "register";
  const notice = state.authNotice || "";
  const error = state.authError || "";
  return `<div class="welcome">
    ${mirrors()}
    ${welcomeHero(state)}
    <section class="welcome-right">
      <div class="card card--pad-lg auth-card">
        <div class="auth-tabs" role="tablist" aria-label="账号">
          <button type="button" class="auth-tab ${isLogin ? "auth-tab--active" : ""}" data-action="switch-auth-mode" data-value="login">登录</button>
          <button type="button" class="auth-tab ${!isLogin ? "auth-tab--active" : ""}" data-action="switch-auth-mode" data-value="register">注册</button>
        </div>
        <form data-form="auth" class="auth-form" novalidate>
          <h2 class="card-title">${isLogin ? "欢迎回来" : "创建账号"}</h2>
          <p class="page-sub" style="font-size:13px">${isLogin ? "登录后继续你的游戏身份和匹配。" : "用用户名注册，匹配到的每一步都是真人玩家。"}</p>
          <div class="field">
            <label class="label" for="auth-username">用户名</label>
            <input class="input" id="auth-username" name="username" type="text" value="${esc(state.authUsername)}" placeholder="2-24 位字母、数字或中文" autocomplete="username" required />
          </div>
          <div class="field">
            <label class="label" for="auth-password">密码</label>
            <div class="auth-password-wrap">
              <input class="input" id="auth-password" name="password" type="password" placeholder="${isLogin ? "输入密码" : "至少 6 位"}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />
              <button type="button" class="auth-password-toggle" data-action="toggle-password" aria-label="显示密码">
                <svg class="icon eye-on" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                <svg class="icon eye-off" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
              </button>
            </div>
          </div>
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="form-actions">
            ${button({ label: isLogin ? "登录" : "注册", action: "auth-submit", kind: "primary", size: "lg", iconName: isLogin ? "arrowRight" : "userRound", extra: "btn--block" })}
          </div>
          <div class="auth-switch">${isLogin ? "没有账号？" : "已有账号？"}<button type="button" class="auth-switch-link" data-action="switch-auth-mode" data-value="${isLogin ? "register" : "login"}">${isLogin ? "去注册" : "去登录"}</button></div>
        </form>
      </div>
    </section>
  </div>`;
}
