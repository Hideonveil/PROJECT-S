import { button, esc } from "../ui.js";
import { welcomeHero } from "./welcome.js";

export function authPage(state) {
  if (state.authVerify) return verifyPage(state);
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
          <p class="page-sub" style="font-size:13px">${isLogin ? "登录后继续你的游戏身份和匹配。" : "用邮箱注册，匹配到的每一步都是真人玩家。"}</p>
          <div class="field">
            <label class="label" for="auth-email">邮箱</label>
            <input class="input" id="auth-email" name="email" type="email" value="${esc(state.authEmail)}" placeholder="you@example.com" autocomplete="email" required />
          </div>
          <div class="field">
            <label class="label" for="auth-password">密码</label>
            <input class="input" id="auth-password" name="password" type="password" placeholder="${isLogin ? "输入密码" : "至少 6 位"}" autocomplete="${isLogin ? "current-password" : "new-password"}" required />
          </div>
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="form-actions">
            ${button({ label: isLogin ? "登录" : "注册并获取验证码", action: "auth-submit", kind: "primary", size: "lg", iconName: isLogin ? "arrowRight" : "send", extra: "btn--block" })}
          </div>
          <button type="button" class="auth-switch" data-action="switch-auth-mode" data-value="${isLogin ? "register" : "login"}">${isLogin ? "没有账号？去注册" : "已有账号？去登录"}</button>
        </form>
      </div>
    </section>
  </div>`;
}

function verifyPage(state) {
  const email = String(state.authVerify?.email || state.authEmail || "");
  const notice = state.authNotice || "";
  const error = state.authError || "";
  return `<div class="welcome">
    ${welcomeHero(state)}
    <section class="welcome-right">
      <div class="card card--pad-lg auth-card">
        <div class="auth-tabs" role="tablist" aria-label="邮箱验证">
          <button type="button" class="auth-tab auth-tab--active">邮箱验证</button>
          <button type="button" class="auth-tab" data-action="switch-auth-mode" data-value="login">登录</button>
        </div>
        <form data-form="verify" class="auth-form" novalidate>
          <h2 class="card-title">输入验证码</h2>
          <p class="page-sub" style="font-size:13px">验证码已发送到 <strong>${esc(email)}</strong>，请输入 6 位数字验证码完成注册。</p>
          <div class="field">
            <label class="label" for="verify-code">验证码</label>
            <input class="input" id="verify-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字" required />
          </div>
          ${notice ? `<div class="auth-note" data-auth-note>${esc(notice)}</div>` : ""}
          ${error ? `<div class="auth-error" data-auth-error>${esc(error)}</div>` : ""}
          <div class="form-actions">
            ${button({ label: "验证并进入", action: "verify-email", kind: "primary", size: "lg", iconName: "check", extra: "btn--block" })}
            ${button({ label: "重新发送验证邮件", action: "resend-verification", kind: "outline", size: "sm", iconName: "refreshCw", extra: "btn--block" })}
          </div>
          <button type="button" class="auth-switch" data-action="switch-auth-mode" data-value="login">返回登录</button>
        </form>
      </div>
    </section>
  </div>`;
}
