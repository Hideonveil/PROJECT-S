import * as api from "./api.js?v=20260828-peer-sync-01";
import { sessionBelongsToRoom } from "./session-scope.js";
import { resetState, state, update } from "./store.js";
import { withProjectTransition } from "./transition.js";
import { toast } from "./ui.js";

export function createAuthController({
  render,
  navigate,
  showAuthError,
  applyServerSnapshot,
  isRecruitmentExitRoom,
  isActiveSessionRoom,
  getRouteName,
  scheduleResumeRoomPrompt,
  connectEvents,
}) {
  let authSubmitPending = false;
  let verificationPending = false;
  let verificationResendPending = false;
  let forgotPasswordPending = false;
  let passwordResetPending = false;

  function mapError(error) {
    const message = String(error?.message || error?.error_description || error || "");
    if (message.includes("Invalid login credentials")) return "用户名或密码错误";
    if (/auth session missing|session.*missing|invalid.*token|expired/i.test(message)) return "重置链接已失效，请重新发送密码重置邮件";
    if (/token.*(expired|invalid)|otp/i.test(message)) return "验证码错误或已过期，请重新获取";
    if (message.includes("EMAIL_NOT_VERIFIED") || message.includes("请先验证邮箱")) return "请先验证邮箱后再登录";
    if (message.includes("User already registered") || message.includes("email_exists") || message.includes("邮箱或用户名已存在")) return "邮箱或用户名已存在，请直接登录";
    if (message.includes("Password should be at least")) return "密码至少 6 位";
    if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("fetch")) return "网络连接失败，请检查网络后重试";
    if (message.includes("Missing password")) return "请输入密码";
    return message || "操作失败，请稍后重试";
  }

  function isPasswordRecoveryCallback() {
    const query = new URLSearchParams(window.location.search || "");
    return query.get("type") === "recovery" || /(?:^|[&#?])type=recovery(?:&|$)/.test(window.location.hash || "");
  }

  async function handleSuccess() {
    const session = await api.getSession();
    if (!session?.access_token) throw new Error("登录状态失效，请重试");
    const status = await api.sessionStatus();
    const profileReady = Boolean(status.profile && Array.isArray(status.profile.genres) && status.profile.genres.length > 0);
    update({
      authenticated: true,
      authUsername: String(session.user?.user_metadata?.username || ""),
      authEmail: String(session.user?.email || ""),
      onboarded: profileReady,
      authError: "",
      authNotice: "",
    });
    if (!profileReady) {
      update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "男", games: [], genres: [], playStyle: "" } });
      navigate("#/welcome");
      return;
    }

    let hasActiveRoom = false;
    update({ user: status.profile });
    try {
      const snapshot = await api.getState();
      update({ user: snapshot.user });
      applyServerSnapshot(snapshot);
      hasActiveRoom = !isRecruitmentExitRoom(snapshot.room) && isActiveSessionRoom(snapshot.room);
    } catch {
      // Profile-only state is enough to enter home.
    }
    connectEvents();
    navigate("#/home");
    if (hasActiveRoom) scheduleResumeRoomPrompt(state.room);
    toast(`欢迎回来，${state.user.nickname}`);
  }

  async function restoreSession() {
    const recoveryCallback = isPasswordRecoveryCallback();
    try {
      const session = await api.getSession();
      if (recoveryCallback) {
        update({ authenticated: false, onboarded: false, authMode: "reset", authError: "", authNotice: "" });
        return;
      }
      if (!session?.access_token) {
        resetState();
        return;
      }
      const status = await api.sessionStatus();
      if (!status.authenticated) {
        await api.signOut().catch(() => {});
        resetState();
        return;
      }
      const profileReady = Boolean(status.profile && Array.isArray(status.profile.genres) && status.profile.genres.length > 0);
      update({
        authenticated: true,
        authUsername: String(session.user?.user_metadata?.username || ""),
        authEmail: String(session.user?.email || ""),
        onboarded: profileReady,
        authError: "",
        authNotice: "",
      });
      if (!profileReady) {
        update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "男", games: [], genres: [], playStyle: "" } });
        return;
      }
      update({ user: status.profile });
      try {
        const snapshot = await api.getState();
        update({ user: snapshot.user });
        applyServerSnapshot(snapshot);
        if (!isRecruitmentExitRoom(snapshot.room) && isActiveSessionRoom(snapshot.room) && ["home", "auth", "welcome", "matching"].includes(getRouteName())) {
          scheduleResumeRoomPrompt(snapshot.room);
        }
      } catch {
        // Keep profile-only state.
      }
    } catch {
      resetState();
      if (recoveryCallback) update({ authMode: "reset", authError: "重置链接无效或已过期，请重新发送。", authNotice: "" });
    }
  }

  async function submitAuth() {
    const form = document.querySelector('[data-form="auth"]');
    if (!form || authSubmitPending) return;
    const submitBtn = form.querySelector('[data-action="auth-submit"]');
    if (submitBtn?.disabled) return;
    const fd = new FormData(form);
    const identifier = String(fd.get("identifier") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");
    const passwordConfirm = String(fd.get("passwordConfirm") || "");
    const isRegister = state.authMode === "register";
    update({ authUsername: identifier, authEmail: email });
    if (!identifier || !password) return showAuthError("请输入用户名和密码");
    if (isRegister && (/\s/.test(identifier) || !/^[\p{L}\p{N}_-]+$/u.test(identifier))) return showAuthError("用户名只能包含中文、字母、数字、下划线或短横线");
    if (isRegister && (identifier.length < 2 || identifier.length > 24)) return showAuthError("用户名需为 2-24 个字符");
    if (isRegister && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) return showAuthError("请输入有效的邮箱地址");
    if (password.length < 6) return showAuthError("密码至少 6 位");
    if (isRegister && !passwordConfirm) return showAuthError("请再次输入密码", { preservePassword: true });
    if (isRegister && password !== passwordConfirm) return showAuthError("两次输入的密码不一致", { preservePassword: true });

    if (submitBtn) {
      submitBtn.disabled = true;
      const label = submitBtn.querySelector("span");
      if (label) label.textContent = "提交中…";
    }
    authSubmitPending = true;
    update({ authError: "", authNotice: "" });
    document.querySelector("[data-auth-error]")?.remove();
    try {
      await withProjectTransition(async () => {
        if (isRegister) {
          await api.registerAccount(identifier, email, password);
          update({ authMode: "login", authUsername: identifier, authEmail: email, authError: "", authNotice: "验证码已发送，请先完成邮箱验证。", authVerification: { email, username: identifier } });
          render();
          return;
        }
        const data = await api.loginByIdentifier(identifier, password);
        await api.setSession(data.session);
        await handleSuccess();
      }, { label: isRegister ? "正在建立账号" : "正在验证玩家身份" });
    } catch (error) {
      showAuthError(mapError(error));
    } finally {
      authSubmitPending = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        const label = submitBtn.querySelector("span");
        if (label) label.textContent = isRegister ? "注册" : "登录";
      }
    }
  }

  async function submitForgotPassword() {
    const form = document.querySelector('[data-form="auth-forgot"]');
    if (!form || forgotPasswordPending) return;
    const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return showAuthError("请输入有效的邮箱地址");
    forgotPasswordPending = true;
    const submitBtn = form.querySelector('[data-action="submit-forgot-password"]');
    if (submitBtn) submitBtn.disabled = true;
    update({ authEmail: email, authError: "", authNotice: "" });
    try {
      await api.requestPasswordReset(email);
      update({ authMode: "forgot", authEmail: email, authError: "", authNotice: "如果该邮箱已注册，重置邮件已经发送，请检查收件箱和垃圾邮件。" });
      render();
    } catch (error) {
      showAuthError(mapError(error));
    } finally {
      forgotPasswordPending = false;
    }
  }

  async function submitPasswordReset() {
    const form = document.querySelector('[data-form="auth-reset"]');
    if (!form || passwordResetPending) return;
    const fd = new FormData(form);
    const password = String(fd.get("password") || "");
    const passwordConfirm = String(fd.get("passwordConfirm") || "");
    if (password.length < 6) return showAuthError("密码至少 6 位", { preservePassword: true });
    if (password !== passwordConfirm) return showAuthError("两次输入的密码不一致", { preservePassword: true });
    passwordResetPending = true;
    const submitBtn = form.querySelector('[data-action="submit-password-reset"]');
    if (submitBtn) submitBtn.disabled = true;
    update({ authError: "", authNotice: "" });
    try {
      await api.updatePassword(password);
      await api.signOut();
      resetState();
      update({ authMode: "login", authNotice: "密码已更新，请使用新密码登录。" });
      navigate("#/auth");
    } catch (error) {
      showAuthError(mapError(error), { preservePassword: true });
    } finally {
      passwordResetPending = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function submitEmailVerification() {
    const form = document.querySelector('[data-form="auth-verify"]');
    const verification = state.authVerification;
    if (!form || !verification?.email || verificationPending) return;
    const token = String(new FormData(form).get("token") || "").trim();
    if (!/^\d{6}$/.test(token)) {
      update({ authError: "请输入 6 位数字验证码", authNotice: "" });
      render();
      return;
    }
    verificationPending = true;
    const submitBtn = form.querySelector('[data-action="verify-email"]');
    if (submitBtn) submitBtn.disabled = true;
    update({ authError: "", authNotice: "" });
    try {
      const data = await api.verifySignupOtp(verification.email, token);
      if (data?.session?.access_token) {
        await handleSuccess();
        return;
      }
      update({ authVerification: null, authMode: "login", authError: "", authNotice: "邮箱已验证，请使用用户名或邮箱登录。" });
      render();
    } catch (error) {
      update({ authError: mapError(error), authNotice: "" });
      render();
    } finally {
      verificationPending = false;
    }
  }

  async function resendEmailVerification() {
    const verification = state.authVerification;
    if (!verification?.email || verificationResendPending) return;
    verificationResendPending = true;
    try {
      await api.resendVerification(verification.email);
      update({ authError: "", authNotice: "验证码已重新发送。" });
      render();
    } catch (error) {
      update({ authError: mapError(error), authNotice: "" });
      render();
    } finally {
      verificationResendPending = false;
    }
  }

  function cancelEmailVerification() {
    update({ authVerification: null, authMode: "login", authError: "", authNotice: "" });
    render();
  }

  return { restoreSession, submitAuth, submitForgotPassword, submitPasswordReset, submitEmailVerification, resendEmailVerification, cancelEmailVerification };
}
