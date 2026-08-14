import { button, esc } from "../ui.js";
import { welcomeHero } from "./welcome.js";

export function authPage(state) {
  const isLogin = state.authMode !== "register";
  const notice = state.authNotice || "";
  const error = state.authError || "";
  return `<div class="welcome">
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
            <input class="input" id="auth-password" name="password" type="password" placeholder="${isLogin ? "输入密码" : "至少 6 位"}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />
          </div>
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="form-actions">
            ${button({ label: isLogin ? "登录" : "注册", action: "auth-submit", kind: "primary", size: "lg", iconName: isLogin ? "arrowRight" : "userRound", extra: "btn--block" })}
          </div>
          <button type="button" class="auth-switch" data-action="switch-auth-mode" data-value="${isLogin ? "register" : "login"}">${isLogin ? "没有账号？去注册" : "已有账号？去登录"}</button>
        </form>
      </div>
    </section>
  </div>`;
}
