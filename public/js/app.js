import { icon } from "./icons.js";
import { avatar, avatarWrap, paintAvatars } from "./avatar.js";
import { initNodeField } from "./field.js";
import { initHeroWaves } from "./hero-waves.js?v=20260820-hero-02";
import { button, esc, needSummary, setProductRailHeldOpen, toast } from "./ui.js";
import { state, update, resetState } from "./store.js";
import { DEVICES, GAME_BY_ID, GAMES, GENRES } from "./data.js";
import { FLOW } from "./flow.js";
import * as api from "./api.js";
import { authPage } from "./pages/auth.js";
import { HERO_PREVIEW_DIRECTORY, heroDirectoryMarkup, heroDirectoryPersonMarkup, heroPreviewPage, landingPage } from "./pages/landing.js?v=20260822-directory-readonly-01";
import { welcomePage } from "./pages/welcome.js";
import { homeFlowStepper, homePage, matchingDirectoryMarkup, matchingDirectoryPersonMarkup } from "./pages/home.js?v=20260822-directory-readonly-01";
import { communityPage } from "./pages/community.js";
import { matchingPage, matchingPreviewPage } from "./pages/matching.js";
import { sessionPage, sessionPreviewPage } from "./pages/session-preview.js?v=20260822-role-fit-01";
import { gameoverPage } from "./pages/gameover.js";
import { connectionsPage } from "./pages/connections.js";
import { mePage } from "./pages/me.js";
import { dismissHeroBoot, withProjectTransition } from "./transition.js";
import { memberDisplayName, sessionMembers } from "./session-members.js";

const app = document.getElementById("app");

const DRAFT = {
  nickname: state.user.nickname,
  avatarKey: state.user.avatarKey,
  device: state.user.device,
  gender: state.user.gender || "男",
  genres: state.user.genres || [],
  playStyle: state.user.playStyle,
  game: state.need.game,
  mode: state.need.mode,
  goal: state.need.goal,
  current: state.need.current,
  target: state.need.target,
  time: state.need.time,
  duration: state.need.duration,
  voice: state.need.voice,
  playerType: state.need.playerType,
  wizardStep: "game",
  wizardSearch: "",
  activityPos: "mode",
  teamPos: "current",
  selectedTags: [],
  modpack: "",
  modpackCustom: "",
  rank: "",
  hero: "",
  role: "",
  voicePref: "都可以",
  style: "",
  needed: 1,
  teamMin: 1,
  teamMax: 1,
  onboardStep: 0,
  onboardDirection: 1,
  dirty: false,
};

const HOME_FILTER = {
  game: "",
  goal: "",
  rank: "",
  step: 0,
  direction: 1,
  ownRoles: [],
  teammateRoles: [],
  time: "现在",
  team: "1",
  teamMin: "1",
  teamMax: "1",
  voice: "on",
};
let homeStepperRevision = 0;
let activeField = null;
let timers = [];
let ONLINE = false;
let eventSourceClose = null;
let chatClose = null;
let chatGeneration = 0;
let presenceHeartbeatHandle = 0;
let chatSendPending = false;
let goodbyeRequestPending = false;
let exitRequestPending = false;
let wizardAdvanceTimer = null;
let roomExitReadyAt = 0;
let matchStartObserver = null;
let productTickerCleanup = null;
let heroWavesCleanup = null;
let targetCursorCleanup = null;
let matchRequestPending = false;
let matchConfirmationPending = false;
let staggeredRailCleanup = null;
let staggeredRailHoldOpen = false;
let lastTrackedRoute = "";
let heroDirectoryOffset = 0;
let heroDirectorySignature = "";
let homeDirectoryOffset = 0;
let homeDirectorySignature = "";
let heroActivityRequestPending = false;
let homeActivityRequestPending = false;
let homeRangePointer = null;
const trackedCandidatePairs = new Set();
let authSubmitPending = false;
let verificationPending = false;
let verificationResendPending = false;
let forgotPasswordPending = false;
let passwordResetPending = false;

function trackCurrentPage() {
  if (!state.authenticated) return;
  const route = parseRoute().name;
  if (!route || route === lastTrackedRoute) return;
  lastTrackedRoute = route;
  api.trackEvent("page_view", { route });
}

function trackCandidate(pair, candidate) {
  if (!pair?.id || !candidate?.id || trackedCandidatePairs.has(pair.id)) return;
  trackedCandidatePairs.add(pair.id);
  api.trackEvent("candidate_viewed", {
    pairId: pair.id,
    gameId: state.need?.game || "deadlock",
    mode: state.need?.goal === "娱乐" ? "casual" : "ranked",
  });
}

function clearTimers() {
  timers.forEach((t) => {
    window.clearTimeout(t);
    window.clearInterval(t);
  });
  timers = [];
  if (matchStartObserver) {
    matchStartObserver.disconnect();
    matchStartObserver = null;
  }
  productTickerCleanup?.();
  productTickerCleanup = null;
  heroWavesCleanup?.();
  heroWavesCleanup = null;
  targetCursorCleanup?.();
  targetCursorCleanup = null;
  staggeredRailCleanup?.();
  staggeredRailCleanup = null;
}

function initProductTicker() {
  const root = document.querySelector("[data-product-ticker]");
  const track = root?.querySelector("[data-ticker-track]");
  const head = root?.querySelector("[data-ticker-head]");
  const tail = root?.querySelector("[data-ticker-tail]");
  if (!root || !track || !head || !tail) return;

  let span = head.getBoundingClientRect().width;
  const matrix = getComputedStyle(track).transform;
  const currentX = matrix && matrix !== "none" ? new DOMMatrixReadOnly(matrix).m41 : 0;
  let offset = span ? ((-currentX % span) + span) % span : 0;
  const measure = () => {
    span = head.getBoundingClientRect().width;
    offset = span ? offset % span : 0;
  };
  measure();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const speed = 74;
  let frame = 0;
  let previous = performance.now();
  const tick = (now) => {
    if (span) {
      offset = (offset + ((now - previous) / 1000) * speed) % span;
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }
    previous = now;
    frame = window.requestAnimationFrame(tick);
  };
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  frame = window.requestAnimationFrame(tick);
  productTickerCleanup = () => {
    window.cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function initTargetCursor() {
  const zones = [...document.querySelectorAll("[data-target-cursor-zone]")];
  const gsap = window.gsap;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const mobileUa = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
  const isMobile = (hasTouch && window.innerWidth <= 768) || mobileUa;
  if (!zones.length || !gsap || isMobile || !window.matchMedia("(pointer: fine)").matches) return;

  const cursor = document.createElement("div");
  cursor.className = "target-cursor target-cursor-wrapper";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `<i class="target-cursor-dot"></i><i class="target-cursor-corner is-tl"></i><i class="target-cursor-corner is-tr"></i><i class="target-cursor-corner is-br"></i><i class="target-cursor-corner is-bl"></i>`;
  document.body.appendChild(cursor);
  const dot = cursor.querySelector(".target-cursor-dot");
  const corners = [...cursor.querySelectorAll(".target-cursor-corner")];
  const home = [
    { x: -18, y: -18 },
    { x: 6, y: -18 },
    { x: 6, y: 6 },
    { x: -18, y: 6 },
  ];
  let activeTarget = null;
  let resumeTimer = 0;
  let spinTween = null;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;

  gsap.set(cursor, { xPercent: -50, yPercent: -50, x: pointerX, y: pointerY });
  corners.forEach((corner, index) => gsap.set(corner, home[index]));

  const startSpin = () => {
    spinTween?.kill();
    spinTween = gsap.to(cursor, { rotation: "+=360", duration: 5, repeat: -1, ease: "none" });
  };
  startSpin();

  const targetPositions = (target) => {
    const rect = target.getBoundingClientRect();
    const cursorX = Number(gsap.getProperty(cursor, "x")) || pointerX;
    const cursorY = Number(gsap.getProperty(cursor, "y")) || pointerY;
    return [
      { x: rect.left - 3 - cursorX, y: rect.top - 3 - cursorY },
      { x: rect.right + 3 - 12 - cursorX, y: rect.top - 3 - cursorY },
      { x: rect.right + 3 - 12 - cursorX, y: rect.bottom + 3 - 12 - cursorY },
      { x: rect.left - 3 - cursorX, y: rect.bottom + 3 - 12 - cursorY },
    ];
  };

  const trackTarget = () => {
    if (!activeTarget) return;
    const positions = targetPositions(activeTarget);
    corners.forEach((corner, index) =>
      gsap.to(corner, { ...positions[index], duration: 0.2, ease: "power1.out", overwrite: "auto" }),
    );
  };

  const releaseTarget = () => {
    if (!activeTarget) return;
    gsap.ticker.remove(trackTarget);
    activeTarget = null;
    cursor.classList.remove("is-locked");
    gsap.killTweensOf(corners);
    corners.forEach((corner, index) => gsap.to(corner, { ...home[index], duration: 0.3, ease: "power3.out" }));
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(startSpin, 50);
  };

  const lockTarget = (target) => {
    if (target === activeTarget) return;
    releaseTarget();
    activeTarget = target;
    gsap.ticker.add(trackTarget);
    window.clearTimeout(resumeTimer);
    spinTween?.kill();
    gsap.killTweensOf(cursor, "rotation");
    gsap.set(cursor, { rotation: 0 });
    cursor.classList.add("is-locked");
    const positions = targetPositions(target);
    corners.forEach((corner, index) => gsap.to(corner, { ...positions[index], duration: 0.25, ease: "power2.out", overwrite: "auto" }));
  };

  const move = (event) => {
    const zone = event.currentTarget;
    pointerX = event.clientX;
    pointerY = event.clientY;
    zone.classList.add("is-target-cursor-active");
    cursor.classList.add("is-visible");
    gsap.to(cursor, { x: pointerX, y: pointerY, opacity: 1, duration: 0.1, ease: "power3.out", overwrite: "auto" });
    const nextTarget = event.target.closest?.(".cursor-target") || null;
    if (nextTarget) lockTarget(nextTarget);
    else releaseTarget();

  };

  const leave = (event) => {
    releaseTarget();
    event.currentTarget.classList.remove("is-target-cursor-active");
    cursor.classList.remove("is-visible", "is-down");
    gsap.to(cursor, { opacity: 0, duration: 0.12, overwrite: "auto" });
  };
  const down = () => {
    cursor.classList.add("is-down");
    gsap.to(dot, { scale: 0.7, duration: 0.3 });
    gsap.to(cursor, { scale: 0.9, duration: 0.2 });
  };
  const up = () => {
    cursor.classList.remove("is-down");
    gsap.to(dot, { scale: 1, duration: 0.3 });
    gsap.to(cursor, { scale: 1, duration: 0.2 });
  };
  const scroll = () => {
    if (!activeTarget) return;
    const element = document.elementFromPoint(pointerX, pointerY);
    if (!element || (element !== activeTarget && element.closest?.(".cursor-target") !== activeTarget)) releaseTarget();
    else {
      const positions = targetPositions(activeTarget);
      corners.forEach((corner, index) => gsap.to(corner, { ...positions[index], duration: 0.2, ease: "power1.out", overwrite: "auto" }));
    }
  };
  zones.forEach((zone) => {
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerleave", leave);
    zone.addEventListener("pointerdown", down);
  });
  window.addEventListener("pointerup", up);
  window.addEventListener("scroll", scroll, { passive: true });

  targetCursorCleanup = () => {
    zones.forEach((zone) => {
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerleave", leave);
      zone.removeEventListener("pointerdown", down);
      zone.classList.remove("is-target-cursor-active");
    });
    window.removeEventListener("pointerup", up);
    window.removeEventListener("scroll", scroll);
    window.clearTimeout(resumeTimer);
    gsap.ticker.remove(trackTarget);
    spinTween?.kill();
    gsap.killTweensOf(cursor);
    gsap.killTweensOf(corners);
    gsap.killTweensOf(dot);
    cursor.remove();
  };
}

function initStaggeredRail() {
  const rail = document.querySelector("[data-staggered-rail]");
  const gsap = window.gsap;
  if (!rail || !gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const layers = [...rail.querySelectorAll(".product-rail-layer")];
  const labels = [...rail.querySelectorAll(".product-nav-link > span")];
  const secondary = [...rail.querySelectorAll(".product-brand strong, .product-rail-footer .product-account > div, .product-rail-footer .product-account--signed > span:last-child")];
  const accountPopover = rail.querySelector("[data-account-popover]");
  const accountTrigger = rail.querySelector('[data-action="toggle-account-menu"]');
  let openTimeline = null;
  let closeTween = null;
  let focusOutTimer = null;
  let pointerLeaveTimer = null;

  if (!staggeredRailHoldOpen) {
    gsap.set(layers, { xPercent: -112, opacity: 1 });
    gsap.set(labels, { yPercent: 125, rotate: 7, opacity: 0, transformOrigin: "50% 100%" });
    gsap.set(secondary, { y: 12, opacity: 0 });
  }

  const open = () => {
    closeTween?.kill();
    openTimeline?.kill();
    rail.classList.add("is-staggered-open");
    openTimeline = gsap.timeline();
    layers.forEach((layer, index) => {
      openTimeline.to(layer, { xPercent: 0, opacity: 1, duration: 0.5, ease: "power4.out", overwrite: "auto" }, index * 0.07);
    });
    openTimeline.to(labels, { yPercent: 0, rotate: 0, opacity: 1, duration: 0.72, ease: "power4.out", stagger: 0.075 }, 0.1);
    openTimeline.to(secondary, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out", stagger: 0.06 }, 0.18);
  };

  const close = () => {
    staggeredRailHoldOpen = false;
    setProductRailHeldOpen(false);
    openTimeline?.kill();
    if (rail.classList.contains("is-route-held")) {
      rail.classList.remove("is-route-held");
      void rail.offsetWidth;
    }
    rail.classList.remove("is-staggered-open");
    rail.classList.remove("is-account-menu-open");
    if (accountPopover) accountPopover.hidden = true;
    accountTrigger?.setAttribute("aria-expanded", "false");
    closeTween?.kill();
    closeTween = gsap.to(layers, { xPercent: -112, duration: 0.3, ease: "power3.in", stagger: 0.035, overwrite: "auto" });
    gsap.to(labels, { yPercent: 55, opacity: 0, duration: 0.2, ease: "power2.in", stagger: { each: 0.025, from: "end" }, overwrite: "auto" });
    gsap.to(secondary, { y: 8, opacity: 0, duration: 0.18, ease: "power2.in", overwrite: "auto" });
  };

  const restoreOpen = () => {
    rail.classList.add("is-staggered-open");
    gsap.set(layers, { xPercent: 0, opacity: 1 });
    gsap.set(labels, { yPercent: 0, rotate: 0, opacity: 1 });
    gsap.set(secondary, { y: 0, opacity: 1 });
  };

  const pointerEnter = () => {
    window.clearTimeout(pointerLeaveTimer);
    if (rail.classList.contains("is-staggered-open")) return;
    if (staggeredRailHoldOpen) {
      restoreOpen();
      return;
    }
    open();
  };

  const pointerLeave = () => {
    window.clearTimeout(pointerLeaveTimer);
    pointerLeaveTimer = window.setTimeout(() => {
      if (!rail.isConnected || rail.matches(":hover") || rail.contains(document.activeElement)) return;
      close();
    }, 90);
  };

  const focusIn = () => {
    if (rail.classList.contains("is-staggered-open")) return;
    open();
  };

  const holdOpenOnNavigation = (event) => {
    if (!event.target.closest("[data-nav]")) return;
    staggeredRailHoldOpen = true;
    setProductRailHeldOpen(true);
  };

  const clickAway = (event) => {
    if (!rail.classList.contains("is-account-menu-open") || rail.contains(event.target)) return;
    close();
  };

  const focusOut = () => {
    window.clearTimeout(focusOutTimer);
    focusOutTimer = window.setTimeout(() => {
      if (!rail.isConnected) return;
      if (!rail.contains(document.activeElement) && !rail.matches(":hover")) close();
    }, 0);
  };
  rail.addEventListener("pointerenter", pointerEnter);
  rail.addEventListener("pointerleave", pointerLeave);
  rail.addEventListener("focusin", focusIn);
  rail.addEventListener("focusout", focusOut);
  rail.addEventListener("click", holdOpenOnNavigation);
  document.addEventListener("pointerdown", clickAway);
  if (staggeredRailHoldOpen) restoreOpen();

  staggeredRailCleanup = () => {
    window.clearTimeout(focusOutTimer);
    window.clearTimeout(pointerLeaveTimer);
    rail.removeEventListener("pointerenter", pointerEnter);
    rail.removeEventListener("pointerleave", pointerLeave);
    rail.removeEventListener("focusin", focusIn);
    rail.removeEventListener("focusout", focusOut);
    rail.removeEventListener("click", holdOpenOnNavigation);
    document.removeEventListener("pointerdown", clickAway);
    openTimeline?.kill();
    closeTween?.kill();
    gsap.killTweensOf([...layers, ...labels, ...secondary]);
  };
}

function toggleProductAccountMenu(trigger) {
  const rail = document.querySelector("[data-staggered-rail]");
  const popover = rail?.querySelector("[data-account-popover]");
  if (!rail || !popover || !trigger) return;
  const opening = popover.hidden;
  popover.hidden = !opening;
  rail.classList.toggle("is-account-menu-open", opening);
  rail.classList.toggle("is-staggered-open", opening);
  trigger.setAttribute("aria-expanded", String(opening));
  if (opening) {
    // Keep the rail rendered exactly as-is. Opening the account menu must not
    // rerender the shell or replay the navigation entrance animation.
    rail.classList.add("is-route-held");
  } else {
    rail.classList.remove("is-route-held");
  }
}

function persistentProductShell(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const currentRail = app.querySelector("[data-staggered-rail]");
  const nextRail = template.content.querySelector("[data-staggered-rail]");
  const currentTicker = app.querySelector("[data-product-ticker]");
  const nextTicker = template.content.querySelector("[data-product-ticker]");

  if (currentRail && nextRail) {
    currentRail.className = nextRail.className;
    const currentNav = currentRail.querySelector(".product-nav");
    const nextNav = nextRail.querySelector(".product-nav");
    const currentLinks = [...currentRail.querySelectorAll("[data-nav]")];
    const nextLinks = [...nextRail.querySelectorAll("[data-nav]")];
    const sameNavStructure =
      currentLinks.length === nextLinks.length &&
      currentLinks.every((link, index) => link.getAttribute("href") === nextLinks[index]?.getAttribute("href"));
    if (!sameNavStructure && currentNav && nextNav) currentNav.innerHTML = nextNav.innerHTML;
    else {
      currentLinks.forEach((link, index) => {
        link.classList.toggle("is-active", nextLinks[index]?.classList.contains("is-active"));
      });
    }
    const currentFooter = currentRail.querySelector(".product-rail-footer");
    const nextFooter = nextRail.querySelector(".product-rail-footer");
    if (currentFooter && nextFooter && currentFooter.innerHTML !== nextFooter.innerHTML) currentFooter.innerHTML = nextFooter.innerHTML;
    nextRail.replaceWith(currentRail);
  }
  if (currentTicker && nextTicker) {
    // Keep the ticker's running animation across route changes, but always
    // adopt the destination shell's class contract. The hero ticker carries
    // `landing-ticker`, whose relative positioning is only valid inside the
    // landing layout; leaking that class into the product shell places the
    // warning strip under the narrow navigation column until a refresh.
    currentTicker.className = nextTicker.className;
    nextTicker.replaceWith(currentTicker);
  }
  const preserveStepper = (selector, markerSelector, lineSelector) => {
    const currentStepper = app.querySelector(selector);
    const nextStepper = template.content.querySelector(selector);
    if (!currentStepper || !nextStepper) return;
    const currentSteps = [...currentStepper.querySelectorAll(markerSelector)];
    const nextSteps = [...nextStepper.querySelectorAll(markerSelector)];
    if (currentSteps.length !== nextSteps.length) return;
    currentStepper.setAttribute("aria-label", nextStepper.getAttribute("aria-label") || "身份创建进度");
    currentSteps.forEach((item, index) => {
      const nextItem = nextSteps[index];
      item.className = nextItem?.className || item.className;
      const currentBadge = item.querySelector("b");
      const nextBadge = nextItem?.querySelector("b");
      if (currentBadge && nextBadge) currentBadge.innerHTML = nextBadge.innerHTML;
    });
    const nextLines = [...nextStepper.querySelectorAll(lineSelector)];
    [...currentStepper.querySelectorAll(lineSelector)].forEach((line, index) => {
      line.className = nextLines[index]?.className || line.className;
    });
    nextStepper.replaceWith(currentStepper);
  };
  preserveStepper("[data-registration-stepper]", ".registration-step", ".registration-step-line");
  preserveStepper("[data-home-stepper]", ".match-wizard-marker", ".match-wizard-line");
  return template.content;
}

function switchAuthMode(mode) {
  const workspace = document.querySelector("[data-auth-workspace]");
  if (!workspace) {
    render();
    return;
  }
  const isRegister = mode === "register";
  workspace.classList.toggle("is-login", !isRegister);
  workspace.classList.toggle("is-register", isRegister);
  workspace.querySelector("[data-auth-mode-title]").textContent = isRegister ? "注册" : "登录";
  workspace.querySelectorAll('[data-action="switch-auth-mode"][role="tab"]').forEach((tab) => {
    const active = tab.dataset.value === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const password = workspace.querySelector("#auth-password");
  password.placeholder = isRegister ? "至少 6 位" : "输入密码";
  password.autocomplete = isRegister ? "new-password" : "current-password";
  const confirmSlot = workspace.querySelector(".auth-confirm-slot");
  const confirmInput = workspace.querySelector("#auth-password-confirm");
  confirmSlot.setAttribute("aria-hidden", String(!isRegister));
  confirmInput.disabled = !isRegister;
  if (!isRegister) confirmInput.value = "";
  const emailSlot = workspace.querySelector(".auth-email-slot");
  const emailInput = workspace.querySelector("#auth-email");
  if (emailSlot) emailSlot.setAttribute("aria-hidden", String(!isRegister));
  if (emailInput) emailInput.disabled = !isRegister;
  const identifierLabel = workspace.querySelector("[data-auth-identifier-label]");
  const identifierInput = workspace.querySelector("#auth-identifier");
  if (identifierLabel) identifierLabel.textContent = isRegister ? "用户名" : "用户名或邮箱";
  if (identifierInput) identifierInput.placeholder = isRegister ? "2-24 位字母、数字或中文" : "输入用户名或邮箱";
  const copy = workspace.querySelector("[data-auth-switch-copy]");
  copy.querySelector("span").textContent = isRegister ? "已经有账号？" : "还没有账号？";
  const copyButton = copy.querySelector("button");
  copyButton.textContent = isRegister ? "直接登录" : "创建一个";
  copyButton.dataset.value = isRegister ? "login" : "register";
  workspace.querySelector("[data-auth-submit-label]").textContent = isRegister ? "注册" : "登录";
  workspace.querySelectorAll("[data-auth-note], [data-auth-error]").forEach((message) => message.remove());
}

function initMatchStartDock() {
  const dock = document.querySelector("[data-match-start-dock]");
  const button = dock?.querySelector(".match-start");
  if (!dock || !button) return;

  const morph = (floating) => {
    if (button.classList.contains("is-floating") === floating) return;
    const before = button.getBoundingClientRect();
    button.classList.toggle("is-floating", floating);
    const after = button.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = before.width / Math.max(after.width, 1);
    const sy = before.height / Math.max(after.height, 1);
    button.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "translate(0, 0) scale(1)" }],
      { duration: 420, easing: "cubic-bezier(.2,.85,.25,1)", fill: "none" }
    );
  };

  matchStartObserver = new IntersectionObserver(
    ([entry]) => morph(!entry.isIntersecting),
    { threshold: 0.72, rootMargin: "-8px 0px -8px 0px" }
  );
  matchStartObserver.observe(dock);
}

function clearWizardAdvance() {
  if (wizardAdvanceTimer) {
    window.clearTimeout(wizardAdvanceTimer);
    wizardAdvanceTimer = null;
  }
}

function scheduleWizardAdvance(fn, ms) {
  clearWizardAdvance();
  wizardAdvanceTimer = window.setTimeout(() => {
    wizardAdvanceTimer = null;
    fn();
  }, ms);
}

function destroyField() {
  if (activeField) {
    activeField.destroy();
    activeField = null;
  }
}

function navigate(path) {
  if (location.hash === path) {
    render();
  } else {
    location.hash = path;
  }
}

function replaceCanonicalRoute(path) {
  const nextUrl = `${location.pathname}${location.search}${path}`;
  if (location.hash !== path) history.replaceState(history.state, "", nextUrl);
  render();
  trackCurrentPage();
}

function resetHomeFilter() {
  HOME_FILTER.game = "";
  HOME_FILTER.goal = "";
  HOME_FILTER.rank = "";
  HOME_FILTER.step = 0;
  HOME_FILTER.direction = 1;
  HOME_FILTER.ownRoles = [];
  HOME_FILTER.teammateRoles = [];
  HOME_FILTER.time = "现在";
  HOME_FILTER.team = "1";
  HOME_FILTER.teamMin = "1";
  HOME_FILTER.teamMax = "1";
  HOME_FILTER.voice = "on";
}

async function enterMatchFromHero() {
  resetHomeFilter();
  await withProjectTransition(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    navigate("#/home");
  }, {
    label: "正在进入摇人",
    immediate: true,
    minDuration: 620,
  });
}

async function enterAuth(mode) {
  const nextMode = mode === "register" ? "register" : "login";
  update({ authMode: nextMode, authError: "", authNotice: "", authVerification: null });
  if (parseRoute().name !== "hero") {
    navigate("#/auth");
    return;
  }
  await withProjectTransition(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 90));
    navigate("#/auth");
  }, {
    label: "正在进入账号页面",
    immediate: true,
    minDuration: 560,
  });
}

function enterForgotPassword() {
  const email = document.querySelector("#auth-identifier")?.value?.trim() || state.authEmail || "";
  update({ authMode: "forgot", authEmail: email, authError: "", authNotice: "", authVerification: null });
  navigate("#/auth");
}

function parseRoute() {
  const raw = (location.hash || "#/hero").replace(/^#/, "") || "/hero";
  // Supabase confirmation may append access tokens to the redirect hash. Keep
  // the SPA route stable instead of treating the token as a new page name.
  const clean = raw.split(/[?#]/, 1)[0];
  const path = clean.startsWith("/") ? clean : "/auth";
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "home", id: parts[1] || "" };
}

function isActiveSessionRoom(room) {
  if (!room?.id) return false;
  const terminal = new Set(["completed", "cancelled", "expired"]);
  return !terminal.has(String(room.status || "").toLowerCase())
    && !terminal.has(String(room.sessionStatus || "").toLowerCase());
}

function isLocalOnboardingPreview(route = parseRoute()) {
  return route.name === "welcome-preview" && (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function isLocalMatchingPreview(route = parseRoute()) {
  return route.name === "matching-preview" && (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function isLocalSessionPreview(route = parseRoute()) {
  return route.name === "session-preview" && (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function isLocalHeroPreview(route = parseRoute()) {
  return route.name === "hero-preview" && (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function updateHeroActivityView(match = state.match) {
  const directoryEl = document.getElementById("hero-directory");
  if (!directoryEl) return;
  const directory = Array.isArray(match?.directory) ? match.directory : [];
  const signature = directorySignature(directory);
  // Health polling runs independently from the visual carousel. Do not
  // rebuild the DOM when the data is unchanged, otherwise every poll cancels
  // the current enter/exit animation and makes 1–3 player loops look broken.
  if (signature === heroDirectorySignature && directoryEl.childElementCount) return;
  heroDirectorySignature = signature;
  heroDirectoryOffset = 0;
  const pageSize = Math.min(3, directory.length);
  if (!pageSize) {
    directoryEl.innerHTML = heroDirectoryMarkup(directory);
    return;
  }
  heroDirectoryOffset %= directory.length;
  const visible = Array.from({ length: pageSize }, (_, index) => directory[(heroDirectoryOffset + index) % directory.length]);
  directoryEl.innerHTML = heroDirectoryMarkup(visible);
}

function rotateHeroDirectory() {
  if (!["hero", "hero-preview"].includes(parseRoute().name)) return;
  const directory = parseRoute().name === "hero-preview" ? HERO_PREVIEW_DIRECTORY : (Array.isArray(state.match?.directory) ? state.match.directory : []);
  if (!directory.length) return;
  const directoryEl = document.getElementById("hero-directory");
  const first = directoryEl?.querySelector("[data-hero-directory-person]");
  if (!first) {
    updateHeroActivityView(state.match);
    return;
  }
  if (directory.length === 1) {
    first.classList.remove("is-solo-refresh");
    void first.offsetWidth;
    first.classList.add("is-solo-refresh");
    const timer = window.setTimeout(() => {
      if (!["hero", "hero-preview"].includes(parseRoute().name) || !first.isConnected) return;
      first.classList.remove("is-solo-refresh");
      heroDirectoryOffset = 0;
    }, 760);
    timers.push(timer);
    return;
  }
  const pageSize = Math.min(3, directory.length);
  const nextOffset = (heroDirectoryOffset + 1) % directory.length;
  const nextIndex = (heroDirectoryOffset + pageSize) % directory.length;
  first.classList.add("is-exiting");
  const following = [...directoryEl.querySelectorAll("[data-hero-directory-person]")].slice(1);
  following.forEach((row) => row.classList.add("is-shifting"));
  const replacement = document.createRange().createContextualFragment(heroDirectoryPersonMarkup(directory[nextIndex], "is-entering")).firstElementChild;
  if (!replacement) return;
  replacement.style.position = "absolute";
  replacement.style.left = "0";
  replacement.style.right = "3px";
  replacement.style.bottom = "4px";
  replacement.style.zIndex = "1";
  directoryEl.append(replacement);
  const timer = window.setTimeout(() => {
    if (!["hero", "hero-preview"].includes(parseRoute().name) || !directoryEl.isConnected) return;
    first.remove();
    following.forEach((row) => row.classList.remove("is-shifting"));
    replacement.removeAttribute("style");
    replacement.classList.remove("is-entering");
    heroDirectoryOffset = nextOffset;
  }, 520);
  timers.push(timer);
}

function directorySignature(directory) {
  return JSON.stringify((Array.isArray(directory) ? directory : []).map((person) => ({
    ticketId: person?.ticketId || "",
    nickname: person?.nickname || "",
    gameId: person?.gameId || "",
    mode: person?.mode || "",
    rankCode: person?.rankCode || "",
    desiredRoles: Array.isArray(person?.desiredRoles) ? person.desiredRoles : [],
    microphonePreference: person?.microphonePreference || "",
  })));
}

function updateHomeDirectoryView(match = state.match, { force = false } = {}) {
  const listEl = document.getElementById("home-directory-list");
  if (!listEl) return;
  const directory = Array.isArray(match?.directory) ? match.directory : [];
  const signature = directorySignature(directory);
  if (!force && signature === homeDirectorySignature) return;
  homeDirectorySignature = signature;
  homeDirectoryOffset = 0;
  listEl.innerHTML = directory.length
    ? matchingDirectoryMarkup(directory)
    : `<div class="match-directory-empty"><b>还没有公开的匹配请求</b><span>第一个开始摇人的人，会出现在这里。</span></div>`;
}

function rotateHomeDirectory() {
  if (parseRoute().name !== "home") return;
  const directory = Array.isArray(state.match?.directory) ? state.match.directory : [];
  if (!directory.length) return;
  const listEl = document.getElementById("home-directory-list");
  const first = listEl?.querySelector("[data-home-directory-person]");
  if (!first) {
    updateHomeDirectoryView(state.match, { force: true });
    return;
  }
  if (directory.length === 1) {
    first.classList.remove("is-solo-refresh");
    void first.offsetWidth;
    first.classList.add("is-solo-refresh");
    const timer = window.setTimeout(() => {
      if (parseRoute().name !== "home" || !first.isConnected) return;
      first.classList.remove("is-solo-refresh");
      homeDirectoryOffset = 0;
    }, 760);
    timers.push(timer);
    return;
  }
  const pageSize = Math.min(6, directory.length);
  const nextOffset = (homeDirectoryOffset + 1) % directory.length;
  const nextIndex = (homeDirectoryOffset + pageSize) % directory.length;
  first.classList.add("is-exiting");
  const following = [...listEl.querySelectorAll("[data-home-directory-person]")].slice(1);
  following.forEach((row) => row.classList.add("is-shifting"));
  const replacement = document.createRange().createContextualFragment(matchingDirectoryPersonMarkup(directory[nextIndex], "is-entering")).firstElementChild;
  if (!replacement) return;
  replacement.style.position = "absolute";
  replacement.style.left = "0";
  replacement.style.right = "0";
  replacement.style.bottom = "4px";
  replacement.style.zIndex = "1";
  listEl.append(replacement);
  const timer = window.setTimeout(() => {
    if (parseRoute().name !== "home" || !listEl.isConnected) return;
    first.remove();
    following.forEach((row) => row.classList.remove("is-shifting"));
    replacement.removeAttribute("style");
    replacement.classList.remove("is-entering");
    homeDirectoryOffset = nextOffset;
  }, 520);
  timers.push(timer);
}

async function refreshHomeActivity() {
  if (parseRoute().name !== "home") return;
  if (homeActivityRequestPending) return;
  homeActivityRequestPending = true;
  try {
    const snapshot = await api.health();
    if (parseRoute().name !== "home") return;
    const nextMatch = {
      ...state.match,
      online: Number(snapshot.online ?? state.match.online ?? 0),
      pool: Number(snapshot.matching ?? snapshot.online ?? state.match.pool ?? 0),
      playing: Number(snapshot.playing ?? state.match.playing ?? 0),
      directory: Array.isArray(snapshot.directory) ? snapshot.directory : state.match.directory || [],
    };
    update({ match: nextMatch });
    updateHomeDirectoryView(nextMatch);
  } catch {
    // The matching form remains usable when the public activity snapshot is unavailable.
  } finally {
    homeActivityRequestPending = false;
  }
}

async function refreshHeroActivity() {
  if (parseRoute().name !== "hero") return;
  if (heroActivityRequestPending) return;
  heroActivityRequestPending = true;
  try {
    const snapshot = await api.health();
    if (parseRoute().name !== "hero") return;
    const nextMatch = {
      ...state.match,
      online: Number(snapshot.online ?? state.match.online ?? 0),
      pool: Number(snapshot.matching ?? snapshot.online ?? state.match.pool ?? 0),
      playing: Number(snapshot.playing ?? state.match.playing ?? 0),
      directory: Array.isArray(snapshot.directory) ? snapshot.directory : state.match.directory || [],
    };
    update({ match: nextMatch });
    updateHeroActivityView(nextMatch);
  } catch {
    // Hero remains usable when the public activity snapshot is temporarily unavailable.
  } finally {
    heroActivityRequestPending = false;
  }
}

function render() {
  clearTimers();
  clearWizardAdvance();
  destroyField();
  chatGeneration += 1;
  if (chatClose) {
    chatClose();
    chatClose = null;
  }
  const route = parseRoute();
  const localOnboardingPreview = isLocalOnboardingPreview(route);
  const localMatchingPreview = isLocalMatchingPreview(route);
  const localHeroPreview = isLocalHeroPreview(route);
  const localSessionPreview = isLocalSessionPreview(route);
  if (route.name !== "welcome" && !localOnboardingPreview) DRAFT.dirty = false;
  delete document.body.dataset.gameTheme;

  const publicRoutes = new Set(["hero", "home", "community", "auth"]);
  if (!localOnboardingPreview && !localMatchingPreview && !localHeroPreview && !localSessionPreview && !state.authenticated && !publicRoutes.has(route.name)) {
    location.hash = "#/auth";
    return;
  }
  if (!localOnboardingPreview && !localMatchingPreview && !localHeroPreview && !localSessionPreview && state.authenticated && !state.onboarded && route.name !== "welcome") {
    location.hash = "#/welcome";
    return;
  }
  if (isActiveSessionRoom(state.room) && route.name !== "room") {
    replaceCanonicalRoute("#/room");
    return;
  }
  if (!localOnboardingPreview && !localMatchingPreview && !localHeroPreview && !localSessionPreview && state.authenticated && state.onboarded && (route.name === "auth" || route.name === "welcome")) {
    location.hash = "#/home";
    return;
  }

  let html = "";
  let immersive = false;

  switch (route.name) {
    case "hero":
      html = landingPage(state);
      break;
    case "hero-preview":
      if (!localHeroPreview) {
        navigate("#/hero");
        return;
      }
      html = heroPreviewPage();
      break;
    case "auth":
      html = authPage(state);
      break;
    case "welcome":
      if (!DRAFT.dirty) prepareOnboardDraft();
      html = welcomePage(state, DRAFT);
      break;
    case "welcome-preview":
      if (!DRAFT.dirty) prepareOnboardDraft();
      html = welcomePage({ ...state, authenticated: false, onboarded: false }, DRAFT);
      break;
    case "home":
      html = homePage(state, HOME_FILTER);
      break;
    case "community":
      html = communityPage(state);
      break;
    case "connections":
      html = connectionsPage(state);
      break;
    case "matching": {
      if (state.room) {
        update({ room: null });
        replaceCanonicalRoute(state.session?.status === "completed" ? "#/gameover" : "#/home");
        return;
      }
      if (state.match.status !== "active") {
        navigate("#/home");
        return;
      }
      html = matchingPage(state);
      immersive = true;
      break;
    }
    case "matching-preview":
      if (!localMatchingPreview) {
        navigate("#/hero");
        return;
      }
      html = matchingPreviewPage();
      immersive = true;
      break;
    case "session-preview":
      if (!localSessionPreview) {
        navigate("#/hero");
        return;
      }
      html = sessionPreviewPage(state);
      immersive = true;
      break;
    case "room": {
      if (!isActiveSessionRoom(state.room)) {
        if (state.session?.status === "completed") {
          replaceCanonicalRoute("#/gameover");
        } else {
          update({ room: null });
          replaceCanonicalRoute("#/home");
        }
        return;
      }
      html = sessionPage(state);
      immersive = true;
      break;
    }
    case "gameover": {
      if (!state.session) {
        navigate("#/home");
        return;
      }
      html = gameoverPage(state);
      immersive = true;
      break;
    }
    case "friends":
      // The old standalone friends screen is retired. Keep the legacy hash
      // link safe by taking players to the current profile surface instead of
      // rendering a second, stale friends implementation.
      navigate("#/me");
      return;
    case "me":
      html = mePage(state);
      break;
    default:
      navigate("#/hero");
      return;
  }

  document.body.dataset.immersive = immersive ? "true" : "";
  app.replaceChildren(persistentProductShell(html));
  paintAvatars(app);
  activeField = initNodeField(app);
  initProductTicker();
  initStaggeredRail();

  if (route.name === "hero" || route.name === "hero-preview") {
    heroWavesCleanup = initHeroWaves(document.querySelector("[data-hero-waves]"));
    heroDirectoryOffset = 0;
    heroDirectorySignature = "";
    updateHeroActivityView(route.name === "hero-preview" ? { directory: HERO_PREVIEW_DIRECTORY } : state.match);
    if (route.name === "hero") {
      void refreshHeroActivity();
      // Public Hero pages are not authenticated, so they cannot rely on the
      // private Realtime channel. Poll frequently enough that entering or
      // leaving the pool is visible within a few seconds, with request
      // de-duplication preventing slow responses from piling up.
      timers.push(window.setInterval(refreshHeroActivity, 3000));
    }
    timers.push(window.setInterval(rotateHeroDirectory, 2000));
  }

  if (route.name === "home") {
    initMatchStartDock();
    initTargetCursor();
    homeDirectoryOffset = 0;
    homeDirectorySignature = "";
    updateHomeDirectoryView(state.match, { force: true });
    void refreshHomeActivity();
    timers.push(window.setInterval(refreshHomeActivity, 3000));
    timers.push(window.setInterval(rotateHomeDirectory, 8000));
  }
  if (route.name === "matching") {
    startMatchingFlow();
  }
  if (route.name === "room" && state.room?.status === "playing") startRoomTimer();
  if (route.name === "room" && state.room?.id) {
    initRoomChat();
  }
}

function prepareOnboardDraft() {
  DRAFT.nickname = state.user.nickname || state.authUsername || "";
  DRAFT.avatarKey = String(state.user.avatarKey || "").startsWith("data:") ? state.user.avatarKey : "";
  DRAFT.device = "";
  DRAFT.gender = "男";
  DRAFT.genres = state.user.genres || [];
  DRAFT.playStyle = state.user.playStyle || "";
  DRAFT.onboardStep = 0;
  DRAFT.onboardDirection = 1;
}

function prepareNeedDraft() {
  const durations = ["60", "120", "180", "不限"];
  const times = ["现在就玩", "30分钟后", "晚些时候"];
  DRAFT.game = state.need.game || "valorant";
  DRAFT.mode = state.need.mode || "";
  DRAFT.goal = state.need.goal || "";
  DRAFT.current = Math.min(4, Math.max(1, Number(state.need.current) || 1));
  const stateDesiredTeammates = Math.min(5, Math.max(1, Number(state.need.desiredTeammates || Number(state.need.target || 2) - Number(state.need.current || 1)) || 1));
  const stateMinTeammates = Math.min(stateDesiredTeammates, Math.max(1, Number(state.need.minTeammates || stateDesiredTeammates) || stateDesiredTeammates));
  DRAFT.teamMin = stateMinTeammates;
  DRAFT.teamMax = stateDesiredTeammates;
  DRAFT.needed = stateDesiredTeammates;
  DRAFT.time = times.includes(state.need.time) ? state.need.time : "现在就玩";
  DRAFT.duration = durations.includes(state.need.duration) ? state.need.duration : "60";
  DRAFT.voice = state.need.voice !== false;
  DRAFT.playerType = state.need.playerType || "不限";
  DRAFT.wizardStep = "game";
  DRAFT.wizardSearch = "";
  DRAFT.activityPos = "mode";
  DRAFT.teamPos = "current";
  DRAFT.selectedTags = [];
  DRAFT.modpack = "";
  DRAFT.modpackCustom = "";
  DRAFT.rank = "";
  DRAFT.hero = "";
  DRAFT.role = "";
  DRAFT.voicePref = DRAFT.voice ? "需要" : "不需要";
  DRAFT.style = "";
  DRAFT.details = {};
  DRAFT.dirty = false;
}

function homeWizardPath() {
  return HOME_FILTER.goal === "casual"
    ? ["goal", "team", "voice"]
    : ["goal", "rank", "roles", "voice"];
}

function homeWizardStepKey() {
  const path = homeWizardPath();
  return path[Math.max(0, Math.min(path.length - 1, Number(HOME_FILTER.step) || 0))];
}

function updateHomeFlowStepper() {
  const current = document.querySelector("[data-home-stepper]");
  if (!current) return;
  const template = document.createElement("template");
  template.innerHTML = homeFlowStepper(HOME_FILTER);
  const next = template.content.querySelector("[data-home-stepper]");
  if (!next) return;
  const revision = ++homeStepperRevision;
  const applyNext = () => {
    if (revision !== homeStepperRevision || !current.isConnected) return;
    current.setAttribute("aria-label", next.getAttribute("aria-label") || "Deadlock 配置进度");
    current.replaceChildren(...next.childNodes);
    current.animate(
      [
        { opacity: 0.24, transform: "translateY(7px) scale(0.985)", filter: "blur(3px)" },
        { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      ],
      { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !current.animate) {
    applyNext();
    return;
  }
  const outgoing = current.animate(
    [
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      { opacity: 0.2, transform: "translateY(-6px) scale(0.985)", filter: "blur(3px)" },
    ],
    { duration: 150, easing: "cubic-bezier(.4,0,1,1)" },
  );
  outgoing.finished.then(applyNext).catch(() => {});
}

function toggleHomeChoice(actionEl, selected) {
  actionEl.classList.toggle("is-on", selected);
  actionEl.setAttribute("aria-pressed", String(selected));
  const small = actionEl.querySelector("small");
  if (small) small.textContent = selected ? "已选择" : "可多选";
}

function selectHomeChoice(actionEl) {
  const group = actionEl.closest("[role='group']");
  group?.querySelectorAll(".match-option").forEach((choice) => {
    choice.classList.toggle("is-on", choice === actionEl);
    choice.setAttribute("aria-pressed", String(choice === actionEl));
  });
}

function homeTeamRange() {
  const min = Math.min(5, Math.max(1, Number(HOME_FILTER.teamMin ?? HOME_FILTER.team ?? 1) || 1));
  const max = Math.max(min, Math.min(5, Number(HOME_FILTER.teamMax ?? HOME_FILTER.team ?? min) || min));
  return { min, max };
}

function updateHomeTeamRangeView() {
  const root = document.querySelector("[data-home-team-range]");
  if (!root) return;
  const { min, max } = homeTeamRange();
  const minPercent = ((min - 1) / 4) * 100;
  const maxPercent = ((max - 1) / 4) * 100;
  const summary = root.querySelector("[data-team-range-summary]");
  const note = root.querySelector("[data-team-range-note]");
  const fill = root.querySelector("[data-team-range-fill]");
  const minInput = root.querySelector('[data-home-team-range-input="min"]');
  const maxInput = root.querySelector('[data-home-team-range-input="max"]');
  root.style.setProperty("--team-range-min", `${minPercent}%`);
  root.style.setProperty("--team-range-max", `${maxPercent}%`);
  root.style.setProperty("--team-range-fill-left", `${minPercent}%`);
  root.style.setProperty("--team-range-fill-right", `${100 - maxPercent}%`);
  root.classList.toggle("is-locked", min === max);
  if (summary) summary.textContent = min === max ? `严格匹配 ${min} 位队友` : `接受 ${min}–${max} 位队友`;
  if (note) note.textContent = min === max ? "只进入同样想找该人数的队伍。" : "只加入人数范围与你有交集的队伍。";
  if (fill) {
    fill.style.left = `${minPercent}%`;
    fill.style.right = `${100 - maxPercent}%`;
  }
  root.querySelectorAll("[data-team-range-detent]").forEach((detent) => {
    const value = Number(detent.dataset.teamRangeDetent);
    detent.classList.toggle("is-active", value >= min && value <= max);
    detent.classList.toggle("is-edge", value === min || value === max);
  });
  if (minInput) {
    minInput.value = String(min);
    minInput.max = String(max);
    minInput.setAttribute("aria-label", `最少接受 ${min} 位队友`);
  }
  if (maxInput) {
    maxInput.value = String(max);
    maxInput.min = String(min);
    maxInput.setAttribute("aria-label", `最多接受 ${max} 位队友`);
  }
}

function setHomeTeamRange(handle, rawValue) {
  const value = Math.min(5, Math.max(1, Number(rawValue) || 1));
  let { min, max } = homeTeamRange();
  if (handle === "min") min = Math.min(value, max);
  else max = Math.max(value, min);
  HOME_FILTER.teamMin = String(min);
  HOME_FILTER.teamMax = String(max);
  // Keep the legacy single-value field as the effective upper bound for old
  // summaries and any stale local drafts.
  HOME_FILTER.team = String(max);
  updateHomeTeamRangeView();
}

function stepHomeTeamDetent(handle, direction) {
  const { min, max } = homeTeamRange();
  const current = handle === "min" ? min : max;
  const next = Math.min(5, Math.max(1, current + (direction > 0 ? 1 : -1)));
  setHomeTeamRange(handle, next);
}

function homeTeamRangeValueFromPointer(track, clientX) {
  const rect = track.getBoundingClientRect();
  if (!rect.width) return 1;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.min(5, Math.max(1, Math.round(1 + ratio * 4)));
}

function beginHomeTeamRangePointer(event) {
  if (event.button !== 0) return;
  const track = event.target.closest?.("[data-home-team-range-track]");
  if (!track) return;
  const root = track.closest("[data-home-team-range]");
  if (!root) return;
  const { min, max } = homeTeamRange();
  const value = homeTeamRangeValueFromPointer(track, event.clientX);
  const handle = min === max
    ? (value < min ? "min" : "max")
    : (Math.abs(value - min) <= Math.abs(value - max) ? "min" : "max");
  homeRangePointer = { pointerId: event.pointerId, track, handle };
  track.classList.add("is-dragging");
  track.setPointerCapture?.(event.pointerId);
  root.querySelector(`[data-home-team-range-input="${handle}"]`)?.focus({ preventScroll: true });
  setHomeTeamRange(handle, value);
  event.preventDefault();
}

function moveHomeTeamRangePointer(event) {
  if (!homeRangePointer || event.pointerId !== homeRangePointer.pointerId) return;
  const { track, handle } = homeRangePointer;
  if (!track.isConnected) return;
  setHomeTeamRange(handle, homeTeamRangeValueFromPointer(track, event.clientX));
  event.preventDefault();
}

function endHomeTeamRangePointer(event) {
  if (!homeRangePointer || (event.pointerId != null && event.pointerId !== homeRangePointer.pointerId)) return;
  homeRangePointer.track.classList.remove("is-dragging");
  homeRangePointer.track.releasePointerCapture?.(homeRangePointer.pointerId);
  homeRangePointer = null;
}

function syncHomeFilterToDraft() {
  prepareNeedDraft();
  DRAFT.game = "deadlock";
  DRAFT.mode = HOME_FILTER.goal === "casual" ? "娱乐" : "排位 / 上分";
  DRAFT.goal = HOME_FILTER.goal === "casual" ? "娱乐" : "上分";
  DRAFT.rank = HOME_FILTER.rank;
  DRAFT.time = HOME_FILTER.time || "现在";
  DRAFT.current = 1;
  const teamRange = homeTeamRange();
  DRAFT.teamMin = HOME_FILTER.goal === "casual" ? teamRange.min : 1;
  DRAFT.teamMax = HOME_FILTER.goal === "casual" ? teamRange.max : 1;
  DRAFT.needed = DRAFT.teamMax;
  DRAFT.voice = HOME_FILTER.voice !== "off";
  DRAFT.voicePref = HOME_FILTER.voice;
  DRAFT.role = "";
  DRAFT.selectedTags = HOME_FILTER.goal === "casual"
    ? [`队友人数：${DRAFT.teamMin === DRAFT.teamMax ? DRAFT.teamMax : `${DRAFT.teamMin}–${DRAFT.teamMax}`}`]
    : [
        ...HOME_FILTER.ownRoles.map((role) => `我的位置：${role}`),
        ...HOME_FILTER.teammateRoles.map((role) => `希望队友：${role}`),
      ];
  DRAFT.dirty = true;
}

function startHomeFilter() {
  if (!state.authenticated) {
    update({ authMode: "login", authError: "", authNotice: "登录后即可开始匹配。" });
    navigate("#/auth");
    return;
  }
  syncHomeFilterToDraft();
  startMatch();
}
function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function syncDraftFromDom(page) {
  if (page === "onboard") {
    const form = document.querySelector('[data-form="onboard"]');
    if (!form) return;
    const fd = new FormData(form);
    DRAFT.nickname = String(fd.get("nickname") || "").trim() || DRAFT.nickname;
    DRAFT.device = String(fd.get("device") || DRAFT.device);
    DRAFT.playStyle = String(fd.get("playStyle") || "").trim() || DRAFT.playStyle;
  }
}

function normalizeServerRoom(room) {
  const rawMembers = room.members || (room.players || []).map((p) => ({ ...p, memberStatus: "active", exitedAt: null }));
  const members = rawMembers.map((m) => ({
    ...m,
    id: m.id,
    name: m.nickname || m.name || "玩家",
    handle: m.handle || `${m.nickname || "玩家"}#${String(m.id || "").slice(-4)}`,
    kind: "player",
    games: m.games || [],
    genres: m.genres || [],
    playStyle: m.playStyle || "",
    need: m.need || room.need || state.need,
    memberStatus: m.memberStatus || "active",
    exitedAt: m.exitedAt || null,
    gameAccounts: m.gameAccounts || {},
  }));
  const memberModel = sessionMembers({
    members,
    target: room.target ?? room.targetTotalPlayers ?? room.need?.target,
    goodbyeRequests: room.goodbyeRequests,
  }, state.user.id);
  const other = memberModel.otherMembers[0] || members.find((p) => p.id !== state.user.id) || members[0] || {};
  const partner = {
    ...other,
    name: other.name || other.nickname || "玩家",
    handle: other.handle || `${other.nickname || "玩家"}#${String(other.id || "").slice(-4)}`,
    kind: "player",
    games: other.games || [],
    genres: other.genres || [],
    playStyle: other.playStyle || "",
    need: other.need || room.need || state.need,
    gameAccounts: other.gameAccounts || {},
  };
  return {
    id: room.id,
    code: room.code,
    partner,
    members: memberModel.members,
    activeMembers: memberModel.activeMembers,
    otherMembers: memberModel.otherMembers,
    currentMemberCount: memberModel.currentMemberCount,
    activeMemberCount: memberModel.activeMemberCount,
    targetTotalPlayers: memberModel.targetTotalPlayers,
    status: room.status || "playing",
    startedAt: room.startedAt ? new Date(room.startedAt).getTime() : Date.now(),
    need: room.need || state.need,
    sessionId: room.sessionId || null,
    sessionStatus: room.sessionStatus || null,
    goodbyeRequests: room.goodbyeRequests || [],
    target: memberModel.targetTotalPlayers,
  };
}

function sessionMemberSnapshot(session) {
  const ids = Array.isArray(session?.players) ? session.players.filter(Boolean) : [];
  const sourceMembers = (state.room?.members || []).filter((member) => ids.includes(member.id));
  const members = sourceMembers.length
    ? sourceMembers
    : ids.map((id) => ({ id, name: id === state.user.id ? state.user.nickname || "我" : "玩家", memberStatus: "active" }));
  return sessionMembers({
    members,
    target: state.room?.targetTotalPlayers || state.room?.target || ids.length,
    goodbyeRequests: state.room?.goodbyeRequests,
  }, state.user.id);
}

function sessionPartnerFor(session) {
  const model = sessionMemberSnapshot(session);
  const source = model.otherMembers[0] || state.room?.partner || {};
  return {
    ...source,
    id: source.id || "",
    name: memberDisplayName(source, "对方玩家"),
  };
}

function roomShapeChanged(next, prev) {
  if (!next || !prev) return true;
  if (next.code !== prev.code || next.status !== prev.status) return true;
  if (next.targetTotalPlayers !== prev.targetTotalPlayers || next.activeMemberCount !== prev.activeMemberCount) return true;
  if (JSON.stringify(next.need || {}) !== JSON.stringify(prev.need || {})) return true;
  if (JSON.stringify(next.goodbyeRequests || []) !== JSON.stringify(prev.goodbyeRequests || [])) return true;
  const memberShape = (member) => JSON.stringify([
    member.id,
    member.memberStatus || "active",
    member.exitedAt || "",
    member.nickname || member.name || "",
    member.username || "",
    member.avatarKey || "",
    member.gameAccounts || {},
    member.need || {},
  ]);
  const members = (next.members || []).map(memberShape).join("|");
  const oldMembers = (prev.members || []).map(memberShape).join("|");
  return members !== oldMembers;
}

function updateSessionView(nextRoom) {
  const root = document.querySelector("[data-session-preview]");
  if (!root || !nextRoom) return false;
  const memberModel = sessionMembers(nextRoom, state.user.id);
  const count = memberModel.goodbyeCount;
  const denominator = memberModel.goodbyeDenominator;
  const mine = memberModel.requestIds.has(state.user.id);
  const countEl = root.querySelector("[data-session-goodbye-count]");
  const buttonEl = root.querySelector("[data-session-goodbye-button]");
  const statusEl = root.querySelector("[data-session-goodbye-status]");
  if (countEl) countEl.textContent = `${count}/${denominator}`;
  if (buttonEl) {
    const label = count > 0 ? `拜拜（${count}/${denominator}）` : "拜拜";
    buttonEl.disabled = goodbyeRequestPending;
    buttonEl.dataset.action = mine ? "withdraw-goodbye" : "say-goodbye";
    buttonEl.setAttribute("aria-label", `${label}${mine ? "，再次点击撤回" : ""}`);
    buttonEl.innerHTML = `${icon(goodbyeRequestPending ? "refreshCw" : "handshake", 17, goodbyeRequestPending ? "is-spinning" : "")}<span data-session-goodbye-count>${label}</span>`;
    buttonEl.setAttribute("aria-busy", String(goodbyeRequestPending));
  }
  if (statusEl) {
    const copy = count >= denominator
      ? `${count}/${denominator} 位成员已确认，正在进入赛后反馈。`
      : mine
        ? `${count}/${denominator} 已确认，等待其余 ${Math.max(0, denominator - count)} 位成员。`
        : count > 0
          ? `${count}/${denominator}，已有成员拜拜，点击后回应。`
          : `0/${denominator} 已确认，所有成员都确认后进入赛后反馈。`;
    statusEl.innerHTML = `<i></i>${copy}`;
  }
  return true;
}

function updateGameoverView() {
  const root = document.querySelector("[data-gameover-root]");
  if (!root) return false;
  const like = root.querySelector("[data-gameover-like]");
  if (like) {
    const liked = Boolean(state.session?.liked);
    like.classList.toggle("is-liked", liked);
    like.dataset.value = liked ? "no" : "yes";
    like.setAttribute("aria-pressed", String(liked));
    const teammateCount = state.session?.otherMembers?.length || 1;
    like.innerHTML = `${icon("heart", 22)}<span>${liked ? "已点赞" : teammateCount > 1 ? `为 ${teammateCount} 位队友点赞` : "为 TA 点赞"}</span>`;
  }
  root.querySelectorAll('[data-action="set-room-rating"]').forEach((choice) => {
    const selected = choice.dataset.value === state.session?.rating;
    choice.classList.toggle("is-selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
  });
  return true;
}

function matchmakingShape(match) {
  const confirmations = (match?.pair?.confirmations || [])
    .map((confirmation) => `${confirmation.user_id}:${confirmation.decision || "pending"}`)
    .sort();
  return JSON.stringify([
    match?.lifecycle?.state || null,
    match?.pair?.id || null,
    match?.pair?.state || null,
    match?.candidate?.id || null,
    match?.candidate?.rankCode || match?.candidate?.rank_code || null,
    match?.candidate?.microphonePreference || match?.candidate?.microphone_preference || null,
    confirmations,
    match?.group?.id || null,
    match?.group?.state || null,
    (match?.group?.members || []).map((member) => `${member.userId}:${member.decision}:${member.rankCode || member.rank_code || ""}:${member.microphonePreference || member.microphone_preference || ""}`).sort(),
  ]);
}

function updateMatchingView(previousMatch, nextMatch) {
  if (parseRoute().name !== "matching") return;
  if (nextMatch?.group || previousMatch?.group) {
    // Rebuild the SPA view only; the browser, auth session, and ticket remain
    // untouched while the group member list/action set changes.
    render();
    return;
  }
  const previousAwaiting = ["waiting_confirmation", "matched", "playing"].includes(previousMatch?.pair?.state) && previousMatch?.candidate;
  const nextAwaiting = ["waiting_confirmation", "matched", "playing"].includes(nextMatch?.pair?.state) && nextMatch?.candidate;
  const previousCandidateMeta = `${previousMatch?.candidate?.rankCode || previousMatch?.candidate?.rank_code || ""}:${previousMatch?.candidate?.microphonePreference || previousMatch?.candidate?.microphone_preference || ""}`;
  const nextCandidateMeta = `${nextMatch?.candidate?.rankCode || nextMatch?.candidate?.rank_code || ""}:${nextMatch?.candidate?.microphonePreference || nextMatch?.candidate?.microphone_preference || ""}`;
  if (Boolean(previousAwaiting) !== Boolean(nextAwaiting) || previousMatch?.candidate?.id !== nextMatch?.candidate?.id || previousCandidateMeta !== nextCandidateMeta) {
    // The roster is part of the layout, so a candidate entering or leaving
    // the pair should rebuild the two-column workbench instead of leaving a
    // stale placeholder in the left column.
    render();
    return;
  }
  const pair = nextMatch?.pair;
  const candidate = nextMatch?.candidate;
  const awaiting = ["waiting_confirmation", "matched", "playing"].includes(pair?.state) && candidate;
  if (awaiting) trackCandidate(pair, candidate);
  const mine = pair?.confirmations?.find((confirmation) => confirmation.user_id === state.user.id)?.decision;
  const theirs = pair?.confirmations?.find((confirmation) => confirmation.user_id !== state.user.id)?.decision;
  const title = document.getElementById("matching-modal-title");
  const desc = document.getElementById("match-desc");
  const mark = document.getElementById("matching-candidate-mark");
  const ready = document.getElementById("matching-ready-state");
  const me = document.getElementById("matching-ready-me");
  const them = document.getElementById("matching-ready-them");
  const actions = document.getElementById("matching-confirm-actions");
  const footer = document.getElementById("matching-footer-status");
  if (title) title.textContent = awaiting ? "对方已进入，正在连接" : "寻找与您游戏目标一致的玩家中";
  if (desc) desc.textContent = nextMatch.notice || (awaiting ? "无需双方再次确认，连接完成后 3 秒进入 Session。" : "我们会按游戏、目的、位置与麦克风偏好持续寻找。");
  if (mark) mark.textContent = awaiting ? (candidate.nickname || "玩家").slice(0, 1) : "?";
  if (ready) ready.hidden = true;
  if (me) {
    me.classList.toggle("is-ready", mine === "accepted");
    me.innerHTML = `${icon(mine === "accepted" ? "check" : "clock", 15)}你：${mine === "accepted" ? "已确定" : "待确定"}`;
  }
  if (them) {
    them.classList.toggle("is-ready", theirs === "accepted");
    them.innerHTML = `${icon(theirs === "accepted" ? "check" : "clock", 15)}对方：${theirs === "accepted" ? "已确定" : "待确定"}`;
  }
  if (footer) footer.innerHTML = `<i></i>${awaiting ? "对方已加入，正在建立 Session 连接。" : (nextMatch.notice || "匹配期间保持在线，我们会持续更新状态。")}`;
  if (actions) {
    actions.innerHTML = `<button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>`;
  }
  const found = document.getElementById("match-found");
  if (found) found.textContent = awaiting ? "1" : "0";
  if (previousMatch?.pair?.state === "waiting_confirmation" && !pair) {
    document.querySelector("[data-matching-modal]")?.classList.add("matching-candidate-released");
    window.setTimeout(() => document.querySelector("[data-matching-modal]")?.classList.remove("matching-candidate-released"), 420);
  }
}

function isLiveMatchmakingSnapshot(ticket, pair = null, group = null) {
  if (!ticket) return false;
  const stateName = ticket.state;
  const expiresAt = ticket.expires_at || ticket.expiresAt;
  if (["searching", "candidate_found", "waiting_confirmation"].includes(stateName)
      && expiresAt
      && new Date(expiresAt).getTime() <= Date.now()) {
    return false;
  }
  if (pair && ["cancelled", "expired", "completed"].includes(pair.state)) return false;
  if (group && ["cancelled", "expired", "completed"].includes(group.state)) return false;
  return ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"].includes(stateName);
}

function applyMatchmakingSnapshot(snapshot, options = {}) {
  if (!snapshot) return;
  const previousMatch = state.match;
  const previousShape = matchmakingShape(state.match);
  const ticket = snapshot.ticket || null;
  const pair = snapshot.pair || null;
  const group = snapshot.group || null;
  const candidate = snapshot.candidate || null;
  const active = isLiveMatchmakingSnapshot(ticket, pair, group);
  const livePair = active && pair && !["cancelled", "expired", "completed"].includes(pair.state) ? pair : null;
  const liveGroup = active && group && !["cancelled", "expired", "completed"].includes(group.state) ? group : null;
  const liveCandidate = livePair ? candidate : null;
  const timedOut = state.match?.pair?.state === "waiting_confirmation" && !livePair && ticket?.state === "searching";
  if (livePair?.state === "waiting_confirmation" && liveCandidate) trackCandidate(livePair, liveCandidate);
  const nextMatch = {
      ...state.match,
      status: active ? "active" : "idle",
      online: snapshot.online ?? state.match.online ?? 0,
      pool: snapshot.matching ?? state.match.pool,
      matchable: snapshot.matchable ?? state.match.matchable ?? 0,
      directory: Array.isArray(snapshot.directory) ? snapshot.directory : state.match.directory || [],
      lifecycle: active ? ticket : null,
      pair: livePair,
      group: liveGroup,
      candidate: liveCandidate,
      notice: options.notice || (timedOut
        ? "对方已离开匹配，正在继续寻找其他玩家。"
        : (!active && ticket ? "匹配状态已结束，请重新开始。" : (livePair ? "" : state.match.notice || ""))),
  };
  update({ match: nextMatch });
  const routeName = parseRoute().name;
  if (routeName === "matching" && previousMatch.status === "active" && !active && !state.room) {
    navigate("#/home");
    return;
  }
  if (["matched", "playing"].includes(livePair?.state) && livePair.roomCode) {
    api.getState().then((snapshot) => {
      applyServerSnapshot(snapshot);
    }).catch(() => {});
    return;
  }
  if (["matched", "playing"].includes(liveGroup?.state) && liveGroup.roomCode) {
    api.getState().then((snapshot) => {
      applyServerSnapshot(snapshot);
    }).catch(() => {});
    return;
  }
  if (routeName === "matching" && previousShape !== matchmakingShape(nextMatch)) updateMatchingView(previousMatch, nextMatch);
}

function applyServerSnapshot(data) {
  const routeName = parseRoute().name;
  const previousMatchShape = matchmakingShape(state.match);
  const previousMatch = state.match;
  const previousFriendRequestShape = JSON.stringify(state.friendRequests || {});
  let matchmakingHasTicketField = false;
  let matchmakingLiveTicket = false;
  let matchmakingPartial = false;
  const patch = {
    match: { ...state.match, online: data.online ?? state.match.online ?? 0, pool: data.matching ?? data.online ?? state.match.pool, playing: data.playing ?? state.match.playing },
  };
  if (data.matchmaking) {
    const mm = data.matchmaking;
    const liveTicket = isLiveMatchmakingSnapshot(mm.ticket || null, mm.pair || null, mm.group || null);
    const livePair = liveTicket && mm.pair && !["cancelled", "expired", "completed"].includes(mm.pair.state) ? mm.pair : null;
    const liveGroup = liveTicket && mm.group && !["cancelled", "expired", "completed"].includes(mm.group.state) ? mm.group : null;
    const hasGroupField = Object.prototype.hasOwnProperty.call(mm, "group");
    const hasTicketField = Object.prototype.hasOwnProperty.call(mm, "ticket");
    // A legacy state endpoint may explicitly return ticket:null while omitting
    // all group fields. Treat that response as partial during a live group
    // flow instead of navigating the player out of the matching modal.
    const partialMatchmaking = !hasGroupField && mm.ticket === null;
    const timedOut = previousMatch?.pair?.state === "waiting_confirmation" && !mm.pair && mm.ticket?.state === "searching";
    patch.match = {
      ...patch.match,
      status: (partialMatchmaking || (!hasTicketField && previousMatch.status === "active")) ? "active" : (liveTicket ? "active" : "idle"),
      pool: mm.matching ?? patch.match.pool,
      matchable: mm.matchable ?? 0,
      directory: Array.isArray(mm.directory) ? mm.directory : state.match.directory || [],
      lifecycle: partialMatchmaking || !hasTicketField ? previousMatch.lifecycle : (liveTicket ? mm.ticket : null),
      pair: partialMatchmaking || !hasTicketField ? previousMatch.pair : livePair,
    // Older/partial state payloads do not carry group details. Do not erase
      // a live local group snapshot merely because another reconciliation
      // endpoint has not learned that field yet.
      group: hasGroupField ? liveGroup : previousMatch.group,
      candidate: livePair ? (mm.candidate || null) : (partialMatchmaking || !hasTicketField ? previousMatch.candidate : null),
      notice: livePair ? "" : (timedOut
        ? "对方已离开匹配，正在继续寻找其他玩家。"
        : (!liveTicket && hasTicketField && mm.ticket ? "匹配状态已结束，请重新开始。" : previousMatch.notice || "")),
    };
    matchmakingHasTicketField = hasTicketField;
    matchmakingLiveTicket = liveTicket;
    matchmakingPartial = partialMatchmaking;
  }
  if (data.user) patch.user = data.user;
  if (Array.isArray(data.friends)) {
    patch.friends = data.friends.map((f) => ({
      id: f.id,
      name: f.nickname || f.name,
      avatarKey: f.avatarKey,
      online: f.online !== false,
      lastGame: f.lastGame || "",
      lastTime: f.lastTime || "",
    }));
  }
  if (data.friendRequests) patch.friendRequests = mapServerFriendRequests(data.friendRequests);
  if (data.room) {
    patch.room = normalizeServerRoom(data.room);
  } else if (data.room === null && state.room) {
    patch.room = null;
  }
  if (Array.isArray(data.recentConnections)) {
    patch.recentConnections = data.recentConnections.map((c) => ({
      id: c.player?.id || c.id,
      name: c.player?.nickname || c.player?.name || "玩家",
      avatarKey: c.player?.avatarKey,
      online: c.player?.online !== false,
      handle: c.player?.handle || "",
      gameId: c.gameId || "",
      gameName: (GAME_BY_ID[c.gameId] || {}).name || c.gameId || "游戏",
      playedAt: c.playedAt || "",
      playCount: c.playCount || 1,
      rating: c.rating || null,
      wantAgain: c.wantAgain || null,
    }));
  }
  if (data.session && ["completed", "cancelled"].includes(data.session.status)) {
    const session = data.session;
    if (!state.session || state.session.roomCode !== session.roomCode) {
      update(patch);
      handleServerGameOver(session);
      return;
    }
    const memberModel = sessionMemberSnapshot(session);
    patch.session = {
      ...state.session,
      members: memberModel.members,
      activeMembers: memberModel.activeMembers,
      otherMembers: memberModel.otherMembers,
      currentMemberCount: memberModel.currentMemberCount,
      activeMemberCount: memberModel.activeMemberCount,
      targetTotalPlayers: memberModel.targetTotalPlayers,
      partner: sessionPartnerFor(session),
    };
  }
  const roomChanged = patch.room ? roomShapeChanged(patch.room, state.room) : false;
  update(patch);
  if (routeName === "matching" && matchmakingHasTicketField && !matchmakingLiveTicket && !matchmakingPartial && !patch.room && !state.room) {
    navigate("#/home");
    return;
  }
  const friendRequestsChanged = previousFriendRequestShape !== JSON.stringify(state.friendRequests || {});
  const matchmakingChanged = previousMatchShape !== matchmakingShape(state.match);
  if (["home", "hero"].includes(routeName)) {
    const onlineEl = document.getElementById("home-online-count");
    const playingEl = document.getElementById("home-playing-count");
    if (onlineEl) onlineEl.textContent = String(Math.max(0, state.match.pool ?? 0));
    if (playingEl) playingEl.textContent = String(Math.max(0, state.match.playing ?? 0));
    if (routeName === "hero") updateHeroActivityView(state.match);
    if (routeName === "home" && Array.isArray(data.matchmaking?.directory)) render();
  }
  if (patch.room && routeName === "matching" && isActiveSessionRoom(state.room)) {
    replaceCanonicalRoute("#/room");
    return;
  } else if (patch.room === null && routeName === "room") {
    render();
  } else if (patch.room && routeName === "room" && (roomChanged || friendRequestsChanged)) {
    updateSessionView(state.room);
  }
  if (routeName === "matching" && matchmakingChanged && !patch.room && !state.room) updateMatchingView(previousMatch, state.match);
  if (patch.session) render();
}

async function confirmMatch(decision) {
  const pairId = state.match.pair?.id;
  if (!pairId || matchConfirmationPending) return;
  matchConfirmationPending = true;
  try {
    const snapshot = await api.confirmMatchmaking(pairId, decision);
    applyMatchmakingSnapshot(snapshot, { notice: decision === "rejected" ? "已跳过这位玩家，正在继续寻找。" : "" });
    if (decision === "rejected") toast("已拒绝，继续为你寻找其他玩家");
    if (["matched", "playing"].includes(snapshot.pair?.state) || snapshot.room) {
      const fullState = await api.getState();
      applyServerSnapshot(fullState);
    }
  } catch (error) {
    if (error?.code === "CONNECTION_TIMEOUT") {
      try {
        const snapshot = await api.getMatchmakingStatus();
        applyMatchmakingSnapshot(snapshot);
        if (snapshot?.pair?.state === "matched" || snapshot?.pair?.state === "playing") {
          const fullState = await api.getState();
          applyServerSnapshot(fullState);
        }
        return;
      } catch {
        // Keep the current confirmation UI if the reconciliation also fails.
      }
    }
    toast(error.message);
  } finally {
    matchConfirmationPending = false;
  }
}

async function startGroupMatch(groupId) {
  if (!groupId || matchConfirmationPending) return;
  matchConfirmationPending = true;
  try {
    const snapshot = await api.startMatchGroup(groupId);
    applyMatchmakingSnapshot(snapshot);
    toast("队伍已锁定，正在等待成员确认");
  } catch (error) {
    toast(error.message);
  } finally {
    matchConfirmationPending = false;
  }
}

async function confirmGroupMatch(groupId, decision) {
  if (!groupId || matchConfirmationPending) return;
  matchConfirmationPending = true;
  try {
    const snapshot = await api.confirmMatchGroup(groupId, decision);
    applyMatchmakingSnapshot(snapshot, { notice: decision === "rejected" ? "你已退出这支队伍，正在继续寻找。" : "你已确认加入，正在等其他成员。" });
    if (["matched", "playing"].includes(snapshot.group?.state) || snapshot.group?.roomCode) {
      const fullState = await api.getState();
      applyServerSnapshot(fullState);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    matchConfirmationPending = false;
  }
}

function handleServerRoom(room) {
  const normalized = normalizeServerRoom(room);
  const isNewRoom = !state.room || state.room.code !== normalized.code;
  if (isNewRoom) roomExitReadyAt = 0;
  update({
    room: normalized,
    need: room.need || state.need,
    session: null,
  });
  if (isActiveSessionRoom(normalized) && parseRoute().name !== "room") {
    replaceCanonicalRoute("#/room");
  } else if (parseRoute().name === "room") {
    updateSessionView(normalized);
  }
}

function handleServerGameOver(session) {
  if (!["completed", "cancelled"].includes(session?.status)) return;
  if (state.session && state.session.roomCode === session.roomCode && parseRoute().name === "gameover") return;
  if (session.status === "cancelled") {
    update({
      room: null,
      session: null,
      match: { ...state.match, status: "idle", lifecycle: null, pair: null, group: null, candidate: null },
    });
    navigate("#/home");
    return;
  }
  const memberModel = sessionMemberSnapshot(session);
  const partner = memberModel.otherMembers[0] || sessionPartnerFor(session);
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const gameName = GAME_BY_ID[session.need?.game]?.name || session.need?.game || state.need.game || "游戏";
  const mode = session.need?.mode || state.need.mode || "";
  update({
    room: null,
    match: { ...state.match, status: "idle", lifecycle: null, pair: null, group: null, candidate: null },
    lastRoomCode: session.roomCode,
    session: {
      players: session.players || memberModel.members.map((member) => member.id),
      members: memberModel.members,
      activeMembers: memberModel.activeMembers,
      otherMembers: memberModel.otherMembers,
      currentMemberCount: memberModel.currentMemberCount,
      activeMemberCount: memberModel.activeMemberCount,
      targetTotalPlayers: memberModel.targetTotalPlayers,
      partner: { ...partner },
      roomCode: session.roomCode,
      title: `${gameName}${mode ? ` · ${mode}` : ""}`,
      time,
      outcome: null,
    },
    stats: {
      ...state.stats,
      sessions: state.stats.sessions + 1,
      hours: state.stats.hours + 1,
    },
  });
  navigate("#/gameover");
}

function connectEvents() {
  if (!ONLINE || !state.authenticated) return;
  startPresenceHeartbeat();
  if (eventSourceClose) eventSourceClose();
  eventSourceClose = api.openEvents({
    hello: applyServerSnapshot,
    online: (data) => {
      const pool = data.matching ?? data.online ?? state.match.pool;
      const online = data.online ?? state.match.online ?? 0;
      const playing = data.playing ?? state.match.playing;
      update({ match: { ...state.match, online, pool, playing } });
      const routeName = parseRoute().name;
      if (routeName === "home") {
        render();
      } else if (routeName === "hero") {
        updateHeroActivityView(state.match);
      }
      if (routeName === "matching") {
        const poolEl = document.getElementById("pool-count");
        if (poolEl) poolEl.textContent = String(Math.max(0, pool ?? 0));
      }
    },
    friends: (data) => {
      update({ friends: mapServerFriends(data.friends || []) });
      if (parseRoute().name === "friends") render();
    },
    room: (data) => handleServerRoom(data.room),
    "game-over": (data) => handleServerGameOver(data.session),
  });
}

function markPresenceOnline() {
  if (!ONLINE || !state.authenticated || !state.onboarded) return;
  api.goOnline().catch(() => {});
}

function stopPresenceHeartbeat() {
  if (!presenceHeartbeatHandle) return;
  window.clearInterval(presenceHeartbeatHandle);
  presenceHeartbeatHandle = 0;
}

function startPresenceHeartbeat() {
  if (!ONLINE || !state.authenticated || !state.onboarded || presenceHeartbeatHandle) return;
  const beat = () => {
    if (!ONLINE || !state.authenticated || !state.onboarded) return;
    markPresenceOnline();
  };
  beat();
  presenceHeartbeatHandle = window.setInterval(beat, 10_000);
}

async function refreshAuthenticatedState({ restoreRoute = false } = {}) {
  if (!ONLINE || !state.authenticated) return;
  try {
    const snapshot = await api.getState();
    if (snapshot.user) update({ user: snapshot.user });
    applyServerSnapshot(snapshot);
    if (restoreRoute && snapshot.room && ["home", "auth", "welcome", "matching"].includes(parseRoute().name)) {
      replaceCanonicalRoute("#/room");
    }
  } catch {
    // Realtime will retry; a transient resume failure must not turn a live
    // Session into a local logout or a new match.
  }
}

function showAuthError(message, { preservePassword = false } = {}) {
  update({ authError: message });
  const form = document.querySelector('[data-form="auth"], [data-form="auth-verify"], [data-form="auth-forgot"], [data-form="auth-reset"]');
  const card = form?.closest(".product-auth-panel") || form?.closest(".auth-card") || document.querySelector(".product-auth-panel, .auth-card");
  let errorEl = card?.querySelector("[data-auth-error]");
  if (!errorEl && card) {
    errorEl = document.createElement("div");
    errorEl.className = "auth-error";
    errorEl.dataset.authError = "";
    const actions = card.querySelector(".product-auth-submit-row, .form-actions");
    if (actions) actions.insertAdjacentElement("beforebegin", errorEl);
    else card.appendChild(errorEl);
  }
  if (errorEl) errorEl.textContent = message;
  const pw = form?.querySelector('[name="password"]');
  if (pw && !preservePassword) pw.value = "";
  const identifierInput = form?.querySelector('[name="identifier"]');
  const emailInput = form?.querySelector('[name="email"]');
  update({
    authUsername: identifierInput?.value?.trim() || state.authUsername,
    authEmail: emailInput?.value?.trim() || state.authEmail,
  });
}

function initRoomExitCountdown() {
  const btn = document.querySelector('[data-action="exit-room"]');
  if (!btn) return;
  if (!roomExitReadyAt) roomExitReadyAt = Date.now() + 5000;
  const label = btn.querySelector("span");
  const tick = () => {
    const remain = Math.max(0, Math.ceil((roomExitReadyAt - Date.now()) / 1000));
    if (remain > 0) {
      btn.disabled = true;
      if (label) label.textContent = `${remain}s 后可以主动离开`;
    } else {
      btn.disabled = false;
      if (label) label.textContent = "主动离开";
    }
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  timers.push(timer);
}

async function initRoomChat() {
  const room = state.room;
  if (!room?.id || !state.authenticated) return;
  const generation = chatGeneration;
  const isCurrent = () => generation === chatGeneration && ["room", "matching"].includes(parseRoute().name) && state.room?.id === room.id;
  try {
    const messages = await api.fetchRoomMessages(room.id);
    if (!isCurrent()) return;
    renderChatMessages(messages);
  } catch {
    // history load is best-effort
  }
  try {
    const sb = await api.getSupabaseClient();
    if (!isCurrent()) return;
    const channel = sb.channel(`room-chat-${room.id}`);
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` }, (payload) => {
      if (!isCurrent()) return;
      appendChatMessage(payload.new);
    });
    await channel.subscribe();
    if (!isCurrent()) {
      sb.removeChannel(channel);
      return;
    }
    const close = () => {
      sb.removeChannel(channel);
      if (chatClose === close) chatClose = null;
    };
    chatClose = close;
  } catch {
    // realtime chat is best-effort
  }
  if (!isCurrent()) return;
  const form = document.querySelector('[data-form="room-chat"]');
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendRoomChat();
  });
  document.querySelectorAll("[data-chat-quick-reply]").forEach((quickReply) => {
    quickReply.addEventListener("click", () => {
      sendRoomChat(quickReply.dataset.chatQuickReply || "");
    });
  });
}

function setChatLoading(loading) {
  const form = document.querySelector('[data-form="room-chat"]');
  const input = document.getElementById("chat-input");
  const submit = form?.querySelector("button[type='submit']");
  if (!form || !submit) return;
  form.classList.toggle("is-loading", loading);
  form.setAttribute("aria-busy", String(loading));
  submit.disabled = loading;
  submit.setAttribute("aria-busy", String(loading));
  submit.innerHTML = loading ? icon("refreshCw", 17, "is-spinning") : icon("send", 17);
  if (input) input.disabled = loading;
  document.querySelectorAll("[data-chat-quick-reply]").forEach((quickReply) => {
    quickReply.disabled = loading;
  });
}

function renderChatMessages(messages) {
  const el = document.getElementById("room-chat");
  if (!el) return;
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">还没有消息，打个招呼吧</div>';
    return;
  }
  el.innerHTML = messages.map(chatMessageHtml).join("");
  el.scrollTop = el.scrollHeight;
}

function chatMessageHtml(m) {
  const mine = m.sender_id === state.user.id;
  const time = m.created_at
    ? new Date(m.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";
  return `<div class="chat-msg ${mine ? "chat-msg--mine" : ""}"><div class="chat-bubble">${esc(m.content || "")}</div><div class="chat-time">${time}</div></div>`;
}

function appendChatMessage(m) {
  const el = document.getElementById("room-chat");
  if (!el) return;
  const empty = el.querySelector(".chat-empty");
  if (empty) empty.remove();
  el.insertAdjacentHTML("beforeend", chatMessageHtml(m));
  el.scrollTop = el.scrollHeight;
}

async function sendRoomChat(message = null) {
  const room = state.room;
  const input = document.getElementById("chat-input");
  const text = String(message ?? input?.value ?? "").trim();
  if (!room?.id || !text || chatSendPending) return;
  chatSendPending = true;
  setChatLoading(true);
  try {
    await api.sendRoomMessage(room.id, text, state.user.id);
    if (input) input.value = "";
  } catch (err) {
    toast(err.message || "消息发送失败");
  } finally {
    chatSendPending = false;
    setChatLoading(false);
  }
}

async function completeOnboard() {
  syncDraftFromDom("onboard");
  if (isLocalOnboardingPreview()) {
    toast("这是本地预览，不会保存账号信息");
    return;
  }
  if (!DRAFT.nickname.trim() || !DRAFT.device || !DRAFT.genres.length) {
    toast("请完成昵称、设备和游戏类型");
    return;
  }
  const user = {
    ...state.user,
    nickname: DRAFT.nickname,
    avatarKey: DRAFT.avatarKey,
    device: DRAFT.device,
    gender: "男",
    playStyle: DRAFT.playStyle,
    genres: DRAFT.genres,
  };
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await withProjectTransition(async () => {
      const result = await api.register({
        nickname: user.nickname,
        avatarKey: user.avatarKey,
        device: user.device,
        gender: user.gender,
        genres: user.genres,
        playStyle: user.playStyle,
        voice: user.voice,
      });
      update({
        authenticated: true,
        onboarded: true,
        user: result.user,
        match: { ...state.match, pool: 0 },
      });
      DRAFT.dirty = false;
      connectEvents();
      navigate("#/home");
    }, {
      label: "正在创建玩家身份",
    });
    toast(`欢迎，${user.nickname}`);
  } catch (err) {
    toast(err.message);
  }
}

function moveOnboardStep(direction) {
  syncDraftFromDom("onboard");
  const step = Math.max(0, Math.min(3, Number(DRAFT.onboardStep) || 0));
  if (direction > 0) {
    const error =
      step === 0 && !DRAFT.nickname.trim() ? "请先输入玩家昵称" :
      step === 2 && !DRAFT.device ? "请选择常用设备" :
      step === 3 && !DRAFT.genres.length ? "请至少选择一个游戏类型" : "";
    if (error) {
      toast(error);
      return;
    }
  }
  DRAFT.onboardStep = Math.max(0, Math.min(3, step + direction));
  DRAFT.onboardDirection = direction < 0 ? -1 : 1;
  DRAFT.dirty = true;
  render();
}

async function startMatch() {
  if (matchRequestPending) return;
  DRAFT.dirty = false;
  const roleNumber = (tag) => Number(String(tag).match(/[1-6]/)?.[0]);
  const ownRoles = (DRAFT.selectedTags || [])
    .filter((tag) => String(tag).startsWith("我的位置："))
    .map(roleNumber)
    .filter((role) => role >= 1 && role <= 6);
  const teammateRoles = (DRAFT.selectedTags || [])
    .filter((tag) => String(tag).startsWith("希望队友："))
    .map(roleNumber)
    .filter((role) => role >= 1 && role <= 6);
  // Keep the existing compatibility signal stable while retaining the two
  // role selections separately for the Session readout.
  const desiredRoles = (DRAFT.selectedTags || [])
    .map((tag) => Number(String(tag).match(/[1-6]/)?.[0]))
    .filter((role) => role >= 1 && role <= 6);
  const matchInput = {
    gameId: "deadlock",
    mode: DRAFT.goal === "娱乐" ? "casual" : "ranked",
    rankCode: DRAFT.goal === "娱乐" ? null : DRAFT.rank || null,
    desiredRoles,
    ownRoles,
    teammateRoles,
    microphonePreference: ["on", "off", "any"].includes(DRAFT.voicePref) ? DRAFT.voicePref : (DRAFT.voice === false ? "off" : "on"),
    desiredTeammates: DRAFT.goal === "娱乐" ? Math.min(5, Math.max(1, Number(DRAFT.teamMax || DRAFT.needed) || 1)) : undefined,
    minTeammates: DRAFT.goal === "娱乐" ? Math.min(
      Math.min(5, Math.max(1, Number(DRAFT.teamMax || DRAFT.needed) || 1)),
      Math.max(1, Number(DRAFT.teamMin || DRAFT.teamMax || DRAFT.needed) || 1),
    ) : undefined,
  };
  const need = {
    game: "deadlock", mode: DRAFT.mode, goal: DRAFT.goal, current: 1, target: DRAFT.goal === "娱乐" ? 1 + Number(matchInput.desiredTeammates || 1) : 2,
    desiredTeammates: matchInput.desiredTeammates,
    minTeammates: matchInput.minTeammates,
    time: "现在", duration: "", voice: matchInput.microphonePreference !== "off",
    playerType: desiredRoles.length ? desiredRoles.map((role) => `${role}号位`).join(" / ") : "不限",
    details: { rank: DRAFT.rank || "", tags: DRAFT.selectedTags || [], voicePreference: matchInput.microphonePreference },
  };
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  const previousMatch = { ...state.match };
  matchRequestPending = true;
  update({
    need,
    match: {
      status: "active",
      online: state.match.online ?? 0,
      pool: state.match.pool ?? 0,
      playing: state.match.playing ?? 0,
    },
  });
  try {
    await withProjectTransition(async () => {
      const data = await api.startMatchmaking(matchInput);
      update({
        match: {
          ...state.match,
          online: data.online ?? state.match.online ?? 0,
          status: "active",
          pool: data.matching ?? state.match.pool,
          playing: data.playing ?? state.match.playing,
          matchable: data.matchable ?? 0,
          lifecycle: data.ticket || null,
          pair: data.pair || null,
          group: data.group || null,
          candidate: data.candidate || null,
        },
      });
      navigate("#/matching");
    }, {
      label: "正在进入匹配池",
      immediate: true,
    });
  } catch (err) {
    // A browser timeout does not mean the server rolled back. Reconcile first
    // so a successfully-created ticket cannot become a ghost candidate.
    if (err?.code === "CONNECTION_TIMEOUT") {
      try {
        const snapshot = await api.getMatchmakingStatus();
        if (snapshot?.ticket) {
          applyMatchmakingSnapshot(snapshot);
          navigate("#/matching");
          toast("服务器已确认你在匹配池中");
          return;
        }
      } catch {
        // Fall through only when the server state cannot be recovered.
      }
    }
    update({ match: previousMatch });
    toast(err.message);
  } finally {
    matchRequestPending = false;
  }
}

function startMatchingFlow() {
  const rawStarted = state.match.lifecycle?.search_started_at
    || state.match.lifecycle?.searchStartedAt
    || state.match.lifecycle?.created_at
    || state.match.lifecycle?.createdAt;
  const parsedStarted = rawStarted ? new Date(rawStarted).getTime() : NaN;
  const started = Number.isFinite(parsedStarted) ? Math.min(parsedStarted, Date.now()) : Date.now();
  const interval = window.setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const poolEl = document.getElementById("pool-count");
    const timeEl = document.getElementById("match-time");
    const foundEl = document.getElementById("match-found");
    const titleEl = document.getElementById("match-title");
    if (poolEl) poolEl.textContent = String(Math.max(0, state.match.pool ?? 0));
    if (timeEl) {
      const totalSeconds = Math.max(0, Math.floor(elapsed));
      if (totalSeconds < 60) {
        timeEl.textContent = `${totalSeconds}秒`;
      } else {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        timeEl.textContent = `${minutes}分${seconds}秒`;
      }
    }
    if (foundEl) {
      if (state.match.group) {
        const teammates = (state.match.group.members || []).filter((member) => !member.isOwner && member.decision !== "rejected").length;
        foundEl.textContent = `${teammates}/${state.match.group.desiredTeammates || 1}`;
      } else {
        foundEl.textContent = state.match.pair ? "1" : "0";
      }
    }
    if (titleEl) {
      titleEl.textContent = ["waiting_confirmation", "matched", "playing"].includes(state.match.pair?.state)
        ? "对方已进入，正在连接"
        : elapsed > 3 ? "正在锁定合适玩家" : "正在扫描匹配池";
    }
    const steps = document.querySelectorAll(".matching-modal-step");
    if (steps.length === 3) {
      const connecting = ["waiting_confirmation", "matched", "playing"].includes(state.match.pair?.state);
      steps[1].classList.toggle("is-active", connecting || elapsed < 3);
      steps[1].classList.toggle("is-done", !connecting && elapsed >= 3);
      steps[2].classList.toggle("is-active", connecting || elapsed >= 3);
    }
  }, 350);
  timers.push(interval);
  // Matchmaking state is delivered by Realtime. If that channel is down, the
  // shared reconnect path in realtime.js performs bounded read-only polling;
  // this page never uses a heartbeat or a per-second request loop.
}

function startRoomTimer() {
  const started = state.room?.startedAt || Date.now();
  timers.push(
    window.setInterval(() => {
      const el = document.getElementById("room-timer");
      if (!el) return;
      const secs = Math.floor((Date.now() - started) / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, "0");
      const ss = String(secs % 60).padStart(2, "0");
      el.textContent = `${mm}:${ss}`;
    }, 1000)
  );
}

async function setGoodbyeRequest(requested) {
  const room = state.room;
  if (!room?.code || !ONLINE) return toast("服务暂不可用，请稍后重试");
  if (goodbyeRequestPending) return;
  goodbyeRequestPending = true;
  updateSessionView(room);
  try {
    const result = await api.requestRoomGoodbye(room.code, requested);
    if (result.room) {
      const normalized = normalizeServerRoom(result.room);
      update({ room: normalized });
      updateSessionView(normalized);
    }
    if (result.session && ["completed", "cancelled"].includes(result.session.status)) {
      handleServerGameOver(result.session);
      return;
    }
    const latestRoom = result.room ? normalizeServerRoom(result.room) : room;
    const latestMembers = sessionMembers(latestRoom, state.user.id);
    const waitingFor = Math.max(0, latestMembers.goodbyeDenominator - latestMembers.goodbyeCount);
    toast(requested
      ? `已提出拜拜，正在等其余 ${waitingFor} 位成员回应`
      : "已撤回拜拜");
  } catch (err) {
    toast(err.message);
  } finally {
    goodbyeRequestPending = false;
    updateSessionView(state.room);
  }
}

async function setRoomLiked(liked) {
  const code = state.session?.roomCode || state.lastRoomCode;
  if (!code || !ONLINE) return;
  const previousLiked = state.session?.liked;
  update({ session: { ...state.session, liked } });
  updateGameoverView();
  try {
    await api.roomFeedback(code, { liked });
    if (liked) toast(state.session?.otherMembers?.length > 1 ? "已给本局队友点赞" : "已给对方点赞");
  } catch (err) {
    if (state.session?.liked === liked) {
      update({ session: { ...state.session, liked: previousLiked } });
      updateGameoverView();
    }
    toast(err.message);
  }
}

function exitRoomPrompt() {
  const memberModel = sessionMembers(state.room || {}, state.user.id);
  if (!memberModel.otherMembers.length) return;
  const otherNames = memberModel.otherMembers.map((member) => memberDisplayName(member)).join("、");
  closeSheet();
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="主动离开游戏">
      <div class="sheet-head">
        <h2 class="sheet-title">确定主动离开？</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <div class="profile-identity" style="margin-bottom:14px">
        ${avatarWrap(memberModel.otherMembers[0]?.avatarKey, 56, memberModel.otherMembers[0]?.online)}
        <div>
          <div class="profile-name"><strong>${esc(otherNames || "其他成员")}</strong></div>
          <div class="profile-handle">共 ${memberModel.otherMembers.length} 位其他成员 · 这属于异常退出，不计入正常对局</div>
        </div>
      </div>
      <div class="form-actions">
        ${button({ label: "取消", action: "close-sheet", kind: "ghost" })}
        ${button({ label: "主动离开", action: "confirm-exit-room", kind: "danger", iconName: "logOut" })}
      </div>
    </div>
  `);
}

async function confirmExitRoom() {
  const room = state.room;
  if (!room?.code || !ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  if (exitRequestPending) return;
  exitRequestPending = true;
  const exitButton = document.querySelector('[data-action="confirm-exit-room"]');
  if (exitButton) {
    exitButton.disabled = true;
    exitButton.setAttribute("aria-busy", "true");
    exitButton.innerHTML = `${icon("refreshCw", 16, "is-spinning")}<span>正在离开…</span>`;
  }
  const memberModel = sessionMembers(room, state.user.id);
  try {
    const result = await withProjectTransition(
      () => api.roomAction(room.code, "exit"),
      { label: "正在退出 Session" },
    );
    if (result.session && ["completed", "cancelled"].includes(result.session.status)) {
      closeSheet();
      update({ room: null, session: null, match: { ...state.match, status: "idle", lifecycle: null, pair: null, group: null, candidate: null } });
      closeSheet();
      navigate("#/home");
      toast("已主动离开，本次不计入正常对局");
      return;
    }
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const game = GAME_BY_ID[room.need?.game || state.need.game] || {};
    const title = `${game.name || state.need.game || "游戏"} · ${room.need?.mode || state.need.mode || ""}`;
    closeSheet();
    update({
      room: null,
      session: {
        players: memberModel.members.map((member) => member.id),
        members: memberModel.members,
        activeMembers: memberModel.activeMembers,
        otherMembers: memberModel.otherMembers,
        currentMemberCount: memberModel.currentMemberCount,
        activeMemberCount: memberModel.activeMemberCount,
        targetTotalPlayers: memberModel.targetTotalPlayers,
        partner: { ...(memberModel.otherMembers[0] || {}) },
        roomCode: room.code,
        title,
        time,
        rating: null,
        wantAgain: null,
      },
    });
    update({ lastRoomCode: room.code });
    navigate("#/home");
    toast("已主动离开，本次不计入正常对局");
  } catch (err) {
    toast(err.message);
  } finally {
    exitRequestPending = false;
  }
}

async function setRoomRating(rating) {
  const code = state.session?.roomCode || state.lastRoomCode;
  if (!code || !ONLINE) return;
  const previousRating = state.session?.rating;
  update({ session: { ...state.session, rating } });
  updateGameoverView();
  try {
    await api.roomFeedback(code, { rating });
  } catch (err) {
    if (state.session?.rating === rating) {
      update({ session: { ...state.session, rating: previousRating } });
      updateGameoverView();
    }
    toast(err.message);
  }
}

async function rematchRecent(id) {
  const item = state.recentConnections.find((c) => c.id === id);
  if (!item) return;
  prepareMatchingSetup(item.gameId || "deadlock");
}

function prepareMatchingSetup(gameId = "deadlock") {
  HOME_FILTER.game = gameId;
  HOME_FILTER.goal = "";
  HOME_FILTER.rank = "";
  HOME_FILTER.step = 0;
  HOME_FILTER.direction = -1;
  update({
    room: null,
    session: null,
    match: { ...state.match, status: "idle", lifecycle: null, pair: null, group: null, candidate: null },
  });
  navigate("#/home");
}

async function returnToMatchingSetup() {
  const roomCode = state.room?.code;
  if (roomCode && ONLINE) {
    try {
      await api.roomAction(roomCode, "exit");
    } catch (error) {
      toast(error.message);
      return;
    }
  }
  prepareMatchingSetup("deadlock");
}

async function cancelMatch() {
  clearTimers();
  if (ONLINE) {
    try {
      await api.cancelMatchmaking();
    } catch (error) {
      try {
        applyMatchmakingSnapshot(await api.getMatchmakingStatus());
      } catch {
        // Keep the current state when the cancellation response and
        // reconciliation are both unavailable.
      }
      toast(error?.message || "退出匹配失败，请稍后重试");
      return;
    }
  }
  update({ match: { ...state.match, status: "idle", lifecycle: null, pair: null, group: null, candidate: null } });
  navigate("#/home");
}

function showSheet(html) {
  closeSheet();
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  paintAvatars(wrap);
}

function closeSheet() {
  document.querySelectorAll(".sheet-backdrop").forEach((el) => el.remove());
}

function openProfileEdit() {
  const user = state.user;
  DRAFT.avatarKey = user.avatarKey;
  DRAFT.genres = user.genres || [];
  const selected = [...DRAFT.genres];
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="编辑游戏身份">
      <div class="sheet-head">
        <h2 class="sheet-title">编辑游戏身份</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <form data-form="profile-edit" style="display:flex;flex-direction:column;gap:16px">
        <div class="field">
          <label class="label" for="edit-nickname">昵称</label>
          <input class="input" id="edit-nickname" name="nickname" value="${esc(user.nickname)}" maxlength="12" />
        </div>
        <div class="field">
          <span class="label">头像</span>
          <div class="avatar-pick" data-avatar-pick>
            <button type="button" class="avatar-upload-tile ${!user.avatarKey ? "button--on" : ""}" data-action="pick-avatar" data-value="" aria-label="不设置头像">
              <span>${avatar("", 72)}</span><span>无头像</span>
            </button>
            <button type="button" class="avatar-upload-tile ${String(user.avatarKey).startsWith("data:") ? "button--on" : ""}" data-action="choose-avatar-file" aria-label="上传自定义头像">
              <span data-avatar-preview>${String(user.avatarKey).startsWith("data:") ? avatar(user.avatarKey, 72) : icon("camera", 18)}</span>
              <span>${String(user.avatarKey).startsWith("data:") ? "更换" : "上传"}</span>
            </button>
            <input type="file" accept="image/*" data-avatar-file hidden />
          </div>
        </div>
        <div class="field">
          <label class="label" for="edit-device">设备</label>
          <select class="select" id="edit-device" name="device">
            ${DEVICES.map((d) => `<option ${user.device === d ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="label" for="edit-gender">性别</label>
          <select class="select" id="edit-gender" name="gender">
            ${["男", "女", "保密"].map((g) => `<option ${(user.gender || "保密") === g ? "selected" : ""}>${g}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <span class="label">常玩游戏类型</span>
          <div class="chip-group" data-chip-group="edit-genres">
            ${GENRES.map((g) => `<button type="button" class="chip ${selected.includes(g) ? "chip--on" : ""}" data-action="toggle-genre" data-value="${g}">${esc(g)}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <label class="label" for="edit-style">一句话介绍打法</label>
          <input class="input" id="edit-style" name="playStyle" value="${esc(user.playStyle)}" />
        </div>
        <div class="form-actions">
          ${button({ label: "保存身份", action: "save-profile", kind: "primary", iconName: "check", extra: "btn--block" })}
        </div>
      </form>
    </div>
  `);
}

async function saveProfile() {
  const form = document.querySelector('[data-form="profile-edit"]');
  if (!form) return;
  const fd = new FormData(form);
  const nickname = String(fd.get("nickname") || "").trim() || state.user.nickname;
  const device = String(fd.get("device") || state.user.device);
  const gender = String(fd.get("gender") || state.user.gender || "保密");
  const playStyle = String(fd.get("playStyle") || "").trim() || state.user.playStyle;
  const genres = DRAFT.genres;
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await withProjectTransition(async () => {
      const data = await api.updateProfile({
        nickname, device, gender, playStyle, avatarKey: DRAFT.avatarKey, genres, voice: state.user.voice,
      });
      update({ user: { ...state.user, ...data.user } });
    }, { label: "正在保存玩家资料" });
  } catch (err) {
    toast(err.message);
    closeSheet();
    render();
    return;
  }
  closeSheet();
  render();
  toast("游戏身份已更新");
}

function mapServerFriends(friends) {
  return (friends || []).map((f) => ({
    id: f.id,
    name: f.nickname || f.name,
    avatarKey: f.avatarKey,
    online: f.online !== false,
    lastGame: f.lastGame || state.session?.title || "",
    lastTime: f.lastTime || "",
  }));
}

function mapServerFriendRequests(requests = {}) {
  const mapEntries = (entries) => (entries || []).map((entry) => ({
    createdAt: entry.createdAt || "",
    user: { ...entry.user, name: entry.user?.nickname || entry.user?.name || "玩家" },
  }));
  return { incoming: mapEntries(requests.incoming), outgoing: mapEntries(requests.outgoing) };
}

async function logout() {
  stopPresenceHeartbeat();
  if (state.authenticated) {
    await api.goOffline({ reason: "explicit_logout" });
  }
  if (eventSourceClose) {
    eventSourceClose();
    eventSourceClose = null;
  }
  await withProjectTransition(() => api.signOut().catch(() => {}), { label: "正在退出账号" });
  resetState();
  DRAFT.dirty = false;
  navigate("#/hero");
  toast("已退出登录");
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("已复制");
  } catch {
    toast("复制失败");
  }
}

async function searchFriendByCode() {
  const input = document.getElementById("friend-code-input");
  const code = input?.value?.trim();
  if (!code) {
    toast("请输入好友代码");
    return;
  }
  if (!ONLINE) {
    update({ friendSearchCode: code, friendSearchError: "在线版才支持按代码搜索" });
    render();
    return;
  }
  update({ friendSearchCode: code, friendSearchStatus: "searching", friendSearchError: "", friendSearchResult: null });
  render();
  try {
    const data = await api.searchFriend(code);
    update({ friendSearchResult: data.user, friendSearchStatus: "idle", friendSearchError: "" });
    render();
  } catch (err) {
    update({ friendSearchResult: null, friendSearchStatus: "idle", friendSearchError: err.message });
    render();
  }
}

async function addProjectFriend(targetUserId) {
  if (!ONLINE) {
    toast("在线版才支持添加好友");
    return;
  }
  update({ friendSearchStatus: "adding", friendSearchError: "" });
  render();
  try {
    const data = await api.addFriend({ targetUserId });
    update({
      friends: mapServerFriends(data.friends),
      friendRequests: mapServerFriendRequests(data.friendRequests),
      friendSearchResult: data.status === "accepted" ? null : state.friendSearchResult,
      friendSearchStatus: "idle",
    });
    if (parseRoute().name === "gameover") updateGameoverView();
    else render();
    toast(data.status === "accepted" ? `你和 ${data.user.nickname || "对方"} 已成为“机”缘好友` : "好友申请已发送，等待对方确认");
  } catch (err) {
    update({ friendSearchStatus: "idle", friendSearchError: err.message });
    render();
    toast(err.message);
  }
}

async function respondProjectFriend(requesterId, decision) {
  if (!ONLINE) return toast("在线版才支持处理好友申请");
  try {
    const data = await api.respondFriend(requesterId, decision);
    update({ friends: mapServerFriends(data.friends), friendRequests: mapServerFriendRequests(data.friendRequests) });
    if (parseRoute().name === "gameover") updateGameoverView();
    else render();
    toast(decision === "accepted" ? "已接受好友申请" : "已拒绝好友申请");
  } catch (err) {
    toast(err.message);
  }
}

function openFeedback() {
  if (!state.authenticated || !state.onboarded) {
    // 未登录时直接进入账号页，不再弹出“注册或登录后才能联系我们”提示。
    enterAuth("login");
    return;
  }
  showSheet(`
    <div class="sheet contact-sheet" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <aside class="contact-sheet-rail">
        <span class="contact-sheet-code">CONTACT / OPS / 01</span>
        <div class="contact-sheet-mark">${icon("messageSquare", 38)}</div>
        <div><p>不是发邮件。</p><h2 id="contact-title">把问题直接<br>留给“机”缘。</h2></div>
        <small>提交后会直接进入运营台，由“机”缘团队统一查看和处理。</small>
      </aside>
      <form data-form="feedback" class="contact-form">
        <header class="contact-form-head"><div><span>SIGNAL INBOX</span><h3>联系我们</h3></div><button class="contact-sheet-close" type="button" data-action="close-sheet" aria-label="关闭">${icon("x", 20)}</button></header>
        <fieldset class="contact-types"><legend>这是什么问题？</legend>
          <label><input type="radio" name="category" value="bug" checked><span>发现问题</span></label>
          <label><input type="radio" name="category" value="suggestion"><span>功能建议</span></label>
          <label><input type="radio" name="category" value="other"><span>其他</span></label>
        </fieldset>
        <label class="contact-field" for="feedback-message"><span>告诉我们发生了什么</span><textarea id="feedback-message" name="message" minlength="10" maxlength="500" placeholder="尽量写清楚你刚才做了什么、看到了什么……" required></textarea><small>至少 10 个字 · 最多 500 个字</small></label>
        <label class="contact-field" for="feedback-contact"><span>如何联系你 <i>可选</i></span><input id="feedback-contact" name="contact" placeholder="微信号 / QQ / 邮箱"></label>
        <div class="contact-form-foot"><p>${icon("shieldCheck", 16)}<span>仅限已注册玩家提交，内容直接进入运营台。</span></p>${button({ label: "发送到运营台", action: "submit-feedback", kind: "primary", iconName: "send" })}</div>
      </form>
    </div>
  `);
  window.setTimeout(() => document.querySelector("#feedback-message")?.focus(), 80);
}

async function submitFeedback() {
  const form = document.querySelector('[data-form="feedback"]');
  if (!form) return;
  const submitBtn = form.querySelector('[data-action="submit-feedback"]');
  if (submitBtn?.disabled) return;
  const fd = new FormData(form);
  const message = String(fd.get("message") || "").trim();
  if (message.length < 10) {
    toast("反馈内容至少 10 个字");
    return;
  }
  if (message.length > 500) {
    toast("反馈内容最多 500 个字");
    return;
  }
  if (ONLINE) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "提交中…";
    }
    const requestId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await api.sendFeedback({
        category: fd.get("category") || "bug",
        message,
        contact: String(fd.get("contact") || "").trim(),
        requestId,
      });
      closeSheet();
      toast("已经送到运营台，我们会在这里处理。");
    } catch (err) {
      toast(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "提交反馈";
      }
    }
    return;
  }
  closeSheet();
  toast("反馈已提交");
}

document.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const value = actionEl.dataset.value || "";

  if (action === "pick-avatar") {
    DRAFT.avatarKey = value;
    DRAFT.dirty = true;
    const scope = actionEl.closest("[data-avatar-pick]");
    scope?.querySelectorAll("button").forEach((b) => {
      b.classList.remove("button--on", "is-on");
      b.setAttribute("aria-pressed", "false");
    });
    actionEl.classList.add("button--on", "is-on");
    actionEl.setAttribute("aria-pressed", "true");
    return;
  }

  if (action === "pick-gender") {
    DRAFT.gender = value;
    DRAFT.dirty = true;
    const group = actionEl.closest('[data-chip-group="gender"]');
    group?.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--on"));
    actionEl.classList.add("chip--on");
    return;
  }

  if (action === "choose-avatar-file") {
    const scope = actionEl.closest("[data-avatar-pick]");
    const input = scope?.querySelector("input[data-avatar-file]");
    input?.click();
    return;
  }

  if (action === "choose-avatar-none") {
    DRAFT.avatarKey = "";
    DRAFT.dirty = true;
    const scope = actionEl.closest("[data-avatar-pick]");
    scope?.querySelectorAll("button").forEach((button) => {
      const selected = button === actionEl;
      button.classList.toggle("is-on", selected);
      button.classList.toggle("button--on", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    return;
  }

  if (action === "onboard-choice") {
    const key = actionEl.dataset.key;
    if (!key) return;
    DRAFT[key] = value;
    DRAFT.dirty = true;
    const group = actionEl.closest("[data-identity-choice-group]");
    group?.querySelectorAll(".identity-choice").forEach((choice) => {
      choice.classList.toggle("is-on", choice === actionEl);
      choice.setAttribute("aria-pressed", String(choice === actionEl));
    });
    return;
  }

  if (action === "toggle-genre") {
    const selected = new Set(DRAFT.genres || []);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    DRAFT.genres = [...selected];
    DRAFT.dirty = true;
    actionEl.classList.toggle("chip--on");
    actionEl.classList.toggle("is-on");
    actionEl.setAttribute("aria-pressed", String(DRAFT.genres.includes(value)));
    return;
  }

  if (action === "need-option") {
    const key = actionEl.dataset.key;
    DRAFT[key] = value;
    DRAFT.dirty = true;
    const group = actionEl.parentElement;
    group?.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--on"));
    actionEl.classList.add("chip--on");
    if (key === "game") {
      const game = GAMES.find((g) => g.id === value);
      if (game) DRAFT.mode = game.modes[0];
      render();
    }
    return;
  }

  if (action === "step-value") {
    DRAFT.dirty = true;
    const key = actionEl.dataset.key;
    const delta = Number(actionEl.dataset.delta || 0);
    const min = key === "current" ? 1 : 2;
    const max = 6;
    DRAFT[key] = Math.max(min, Math.min(max, Number(DRAFT[key] || 1) + delta));
    const currentEl = document.getElementById("current-count");
    const targetEl = document.getElementById("target-count");
    if (currentEl && DRAFT.current >= DRAFT.target) {
      DRAFT.current = Math.max(1, DRAFT.target - 1);
    }
    if (currentEl) currentEl.textContent = DRAFT.current;
    if (targetEl) targetEl.textContent = DRAFT.target;
    return;
  }

  if (action === "wizard-game") {
    clearWizardAdvance();
    const game = GAMES.find((g) => g.id === value);
    if (!game) return;
    DRAFT.game = game.id;
    DRAFT.mode = "";
    DRAFT.goal = "";
    DRAFT.modpack = "";
    DRAFT.modpackCustom = "";
    DRAFT.rank = "";
    DRAFT.hero = "";
    DRAFT.role = "";
    DRAFT.selectedTags = [];
    DRAFT.activityPos = "mode";
    DRAFT.teamPos = "current";
    DRAFT.wizardStep = "activity";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-mode") {
    clearWizardAdvance();
    DRAFT.mode = value;
    const flow = FLOW[DRAFT.game] || {};
    DRAFT.goal = flow.goalByMode?.[value] || "";
    DRAFT.activityPos = "mode";
    if (DRAFT.game === "deadlock") {
      DRAFT.activityPos = "rank";
    } else if (DRAFT.game === "minecraft" && value === "整合包") {
      DRAFT.activityPos = "modpack";
    } else {
      DRAFT.activityPos = "done";
    }
    DRAFT.dirty = true;
    render();
    if (DRAFT.activityPos === "done") {
      scheduleWizardAdvance(() => {
        DRAFT.wizardStep = "people";
        render();
      }, 280);
    }
    return;
  }

  if (action === "wizard-modpack") {
    clearWizardAdvance();
    DRAFT.modpack = value;
    DRAFT.activityPos = "done";
    DRAFT.dirty = true;
    render();
    scheduleWizardAdvance(() => {
      DRAFT.wizardStep = "people";
      render();
    }, 260);
    return;
  }

  if (action === "wizard-rank") {
    DRAFT.rank = value;
    DRAFT.activityPos = "hero";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-hero") {
    DRAFT.hero = value;
    DRAFT.activityPos = "role";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-role") {
    DRAFT.role = value;
    DRAFT.activityPos = "done";
    DRAFT.dirty = true;
    render();
    scheduleWizardAdvance(() => {
      DRAFT.wizardStep = "people";
      render();
    }, 260);
    return;
  }

  if (action === "wizard-next-activity") {
    clearWizardAdvance();
    if (DRAFT.activityPos === "modpack" && DRAFT.modpackCustom) DRAFT.modpack = DRAFT.modpackCustom;
    DRAFT.wizardStep = "people";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-tag") {
    const tags = new Set(DRAFT.selectedTags || []);
    if (tags.has(value)) tags.delete(value);
    else tags.add(value);
    DRAFT.selectedTags = [...tags];
    actionEl.classList.toggle("chip--on");
    return;
  }

  if (action === "wizard-skip-tags") {
    DRAFT.selectedTags = [];
    DRAFT.playerType = "不限";
    DRAFT.wizardStep = "time";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-next-people") {
    DRAFT.wizardStep = "time";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-time") {
    DRAFT.time = value;
    DRAFT.teamPos = "current";
    DRAFT.wizardStep = "team";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-current") {
    DRAFT.current = value === "4人+" ? 4 : Number(value.replace("人", "")) || 1;
    DRAFT.teamPos = "needed";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-needed") {
    DRAFT.needed = value === "4人+" ? 4 : Number(value.replace("人", "")) || 1;
    DRAFT.wizardStep = "details";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-voice") {
    DRAFT.voicePref = value;
    DRAFT.voice = value !== "不需要";
    DRAFT.dirty = true;
    const group = actionEl.closest(".chip-group");
    group?.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--on"));
    actionEl.classList.add("chip--on");
    return;
  }

  if (action === "wizard-duration") {
    DRAFT.duration = value;
    DRAFT.dirty = true;
    const group = actionEl.closest(".chip-group");
    group?.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--on"));
    actionEl.classList.add("chip--on");
    return;
  }

  if (action === "wizard-style") {
    DRAFT.style = value;
    DRAFT.dirty = true;
    const group = actionEl.closest(".chip-group");
    group?.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--on"));
    actionEl.classList.add("chip--on");
    return;
  }

  if (action === "wizard-next-details") {
    DRAFT.wizardStep = "confirm";
    DRAFT.dirty = true;
    render();
    return;
  }

  if (action === "wizard-back") {
    clearWizardAdvance();
    const order = ["game", "activity", "people", "time", "team", "details", "confirm"];
    const idx = order.indexOf(DRAFT.wizardStep);
    if (DRAFT.wizardStep === "activity" && DRAFT.activityPos !== "mode") {
      if (DRAFT.game === "deadlock") {
        DRAFT.activityPos = DRAFT.activityPos === "role" ? "hero" : DRAFT.activityPos === "hero" ? "rank" : "mode";
      } else {
        DRAFT.activityPos = "mode";
      }
      render();
      return;
    }
    if (DRAFT.wizardStep === "team" && DRAFT.teamPos === "needed") {
      DRAFT.teamPos = "current";
      render();
      return;
    }
    if (idx <= 0) {
      navigate("#/home");
      return;
    }
    DRAFT.wizardStep = order[idx - 1];
    render();
    return;
  }

  if (action === "home-game") {
    HOME_FILTER.game = value;
    HOME_FILTER.goal = "";
    HOME_FILTER.rank = "";
    HOME_FILTER.step = 0;
    HOME_FILTER.direction = 1;
    HOME_FILTER.ownRoles = [];
    HOME_FILTER.teammateRoles = [];
    HOME_FILTER.voice = "on";
    HOME_FILTER.team = "1";
    HOME_FILTER.teamMin = "1";
    HOME_FILTER.teamMax = "1";
    HOME_FILTER.time = "现在";
    render();
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    return;
  }

  if (action === "home-back-games") {
    HOME_FILTER.game = "";
    HOME_FILTER.step = 0;
    HOME_FILTER.direction = -1;
    render();
    return;
  }

  if (action === "home-goal") {
    const nextGoal = value === "casual" ? "casual" : "rank";
    if (HOME_FILTER.goal !== nextGoal) HOME_FILTER.rank = "";
    HOME_FILTER.goal = nextGoal;
    HOME_FILTER.step = 0;
    HOME_FILTER.direction = 1;
    selectHomeChoice(actionEl);
    updateHomeFlowStepper();
    return;
  }

  if (action === "home-own-role" || action === "home-teammate-role") {
    const key = action === "home-own-role" ? "ownRoles" : "teammateRoles";
    const values = HOME_FILTER[key];
    const selected = values.includes(value);
    if (value === "不限") {
      HOME_FILTER[key] = selected ? [] : ["不限"];
      actionEl.closest("[role='group']")?.querySelectorAll(".match-option").forEach((choice) => {
        const on = !selected && choice === actionEl;
        choice.classList.toggle("is-on", on);
        choice.setAttribute("aria-pressed", String(on));
      });
    } else {
      const withoutUnlimited = values.filter((item) => item !== "不限");
      HOME_FILTER[key] = selected ? withoutUnlimited.filter((item) => item !== value) : [...withoutUnlimited, value];
      const unlimited = actionEl.closest("[role='group']")?.querySelector('[data-value="不限"]');
      unlimited?.classList.remove("is-on");
      unlimited?.setAttribute("aria-pressed", "false");
      toggleHomeChoice(actionEl, !selected);
    }
    return;
  }

  if (action === "home-rank" || action === "home-voice" || action === "home-team" || action === "home-time") {
    if (action === "home-rank") HOME_FILTER.rank = value;
    if (action === "home-voice") HOME_FILTER.voice = ["on", "off", "any"].includes(value) ? value : "any";
    if (action === "home-team") {
      HOME_FILTER.team = value;
      HOME_FILTER.teamMin = value;
      HOME_FILTER.teamMax = value;
    }
    if (action === "home-time") HOME_FILTER.time = value;
    if (action === "home-team") updateHomeTeamRangeView();
    else selectHomeChoice(actionEl);
    return;
  }

  if (action === "home-wizard-next") {
    const stepKey = homeWizardStepKey();
    const error =
      stepKey === "goal" && !HOME_FILTER.goal ? "请选择游戏目的" :
      stepKey === "rank" && !HOME_FILTER.rank ? "请选择当前段位" :
      stepKey === "roles" && !HOME_FILTER.ownRoles.length ? "请选择自己的位置，或选择不限" :
      stepKey === "roles" && !HOME_FILTER.teammateRoles.length ? "请选择希望队友的位置，或选择不限" :
      stepKey === "team" && (!Number(HOME_FILTER.teamMin) || !Number(HOME_FILTER.teamMax) || Number(HOME_FILTER.teamMin) > Number(HOME_FILTER.teamMax)) ? "请设置有效的队友人数范围" : "";
    if (error) {
      toast(error);
      return;
    }
    HOME_FILTER.step = Math.min(homeWizardPath().length - 1, HOME_FILTER.step + 1);
    HOME_FILTER.direction = 1;
    render();
    return;
  }

  if (action === "home-wizard-back") {
    if (HOME_FILTER.step <= 0) {
      HOME_FILTER.game = "";
      HOME_FILTER.step = 0;
    } else {
      HOME_FILTER.step -= 1;
    }
    HOME_FILTER.direction = -1;
    render();
    return;
  }

  if (action === "home-start-match") {
    startHomeFilter();
    return;
  }

  const actions = {
    "enter-match": enterMatchFromHero,
    "scroll-landing-more": () => document.getElementById("landing-more")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    "go-home": () => navigate("#/home"),
    "go-me": () => navigate("#/me"),
    "go-friends": () => navigate("#/me"),
    "toggle-account-menu": () => toggleProductAccountMenu(actionEl),
    "open-auth-login": () => enterAuth("login"),
    "open-auth-register": () => enterAuth("register"),
    "forgot-password": () => enterForgotPassword(),
    "submit-forgot-password": () => submitForgotPassword(),
    "submit-password-reset": () => submitPasswordReset(),
    "back-to-login": () => enterAuth("login"),
    "switch-auth-mode": (value) => {
      const identifier = document.querySelector("#auth-identifier")?.value?.trim() || state.authUsername;
      const email = document.querySelector("#auth-email")?.value?.trim() || state.authEmail;
      const mode = value === "register" ? "register" : "login";
      update({ authMode: mode, authUsername: identifier, authEmail: email, authError: "", authNotice: "" });
      switchAuthMode(mode);
    },
    "toggle-password": () => {
      const toggle = actionEl;
      const input = document.getElementById(toggle.dataset.target || "auth-password");
      if (!input || !toggle) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.classList.toggle("is-show", show);
      toggle.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
      toggle.setAttribute("aria-pressed", String(show));
    },
    "auth-submit": () => submitAuth(),
    "verify-email": () => submitEmailVerification(),
    "resend-verification": () => resendEmailVerification(),
    "cancel-email-verification": () => cancelEmailVerification(),
    "onboard-next": () => moveOnboardStep(1),
    "onboard-back": () => moveOnboardStep(-1),
    "complete-onboard": completeOnboard,
    "start-match": startMatch,
    "cancel-match": cancelMatch,
    "confirm-match": () => confirmMatch("accepted"),
    "reject-match": () => confirmMatch("rejected"),
    "start-group-match": (id) => startGroupMatch(id),
    "confirm-group-match": (id) => confirmGroupMatch(id, "accepted"),
    "reject-group-match": (id) => confirmGroupMatch(id, "rejected"),
    "open-room": () => replaceCanonicalRoute("#/room"),
    "leave-room": exitRoomPrompt,
    "exit-room": exitRoomPrompt,
    "confirm-exit-room": confirmExitRoom,
    "set-room-rating": (value) => setRoomRating(value),
    "rematch-recent": (id) => rematchRecent(id),
    "back-to-match": returnToMatchingSetup,
    "go-recent": () => navigate("#/connections"),
    "say-goodbye": () => setGoodbyeRequest(true),
    "withdraw-goodbye": () => setGoodbyeRequest(false),
    "set-room-like": (value) => setRoomLiked(value === "yes"),
    "open-profile-edit": openProfileEdit,
    "close-sheet": closeSheet,
    "save-profile": saveProfile,
    "logout": logout,
    "search-friend": searchFriendByCode,
    "add-friend": (id) => addProjectFriend(id),
    "accept-friend": (id) => respondProjectFriend(id, "accepted"),
    "reject-friend": (id) => respondProjectFriend(id, "rejected"),
    "copy-code": (code) => copyText(code),
    "open-feedback": () => {
      api.trackEvent("feedback_opened", { page: location.hash || "/" });
      openFeedback();
    },
    "submit-feedback": submitFeedback,
  };

  const fn = actions[action];
  if (fn) fn(value);
});

document.addEventListener("keydown", (event) => {
  const rangeInput = event.target instanceof HTMLInputElement
    ? event.target.closest("[data-home-team-range-input]")
    : null;
  if (rangeInput) {
    const handle = rangeInput.dataset.homeTeamRangeInput || "max";
    const forward = event.key === "ArrowRight" || event.key === "ArrowUp";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowDown";
    if ((forward || backward) && event.shiftKey) {
      event.preventDefault();
      stepHomeTeamDetent(handle, forward ? 1 : -1);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      stepHomeTeamDetent(handle, event.key === "PageUp" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const { min, max } = homeTeamRange();
      setHomeTeamRange(handle, event.key === "Home" ? (handle === "min" ? 1 : min) : (handle === "min" ? max : 5));
      return;
    }
  }
  if (event.key !== "Enter" && event.key !== " ") return;
});

document.addEventListener("pointerdown", beginHomeTeamRangePointer);
document.addEventListener("pointermove", moveHomeTeamRangePointer);
document.addEventListener("pointerup", endHomeTeamRangePointer);
document.addEventListener("pointercancel", endHomeTeamRangePointer);
window.addEventListener("blur", () => endHomeTeamRangePointer({}));

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-binding]")) {
    const key = target.dataset.binding;
    if (target.type === "checkbox") DRAFT[key] = target.checked;
    else DRAFT[key] = target.value;
    if (target.closest('[data-form="need"]')) DRAFT.dirty = true;
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("input[data-avatar-file]")) {
    const file = target.files?.[0];
    if (!file) return;
    readImageAsDataUrl(file).then((dataUrl) => {
      DRAFT.avatarKey = dataUrl;
      DRAFT.dirty = true;
      const scope = target.closest("[data-avatar-pick]");
      scope?.querySelectorAll("button").forEach((b) => {
        b.classList.remove("button--on", "is-on");
        b.setAttribute("aria-pressed", "false");
      });
      const tile = scope?.querySelector('[data-action="choose-avatar-file"]');
      tile?.classList.add("button--on", "is-on");
      tile?.setAttribute("aria-pressed", "true");
      const preview = tile?.querySelector("[data-avatar-preview]");
      if (preview) preview.innerHTML = avatar(dataUrl, target.closest(".identity-avatar-options") ? 126 : 72);
    });
    return;
  }
  if (target.matches("[data-binding]")) {
    const key = target.dataset.binding;
    if (target.type === "checkbox") DRAFT[key] = target.checked;
    else DRAFT[key] = target.value;
    if (target.closest('[data-form="need"]')) DRAFT.dirty = true;
  }
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.matches('[data-form="auth"]')) submitAuth();
  if (event.target.matches('[data-form="auth-verify"]')) submitEmailVerification();
  if (event.target.matches('[data-form="auth-forgot"]')) submitForgotPassword();
  if (event.target.matches('[data-form="auth-reset"]')) submitPasswordReset();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches("[data-home-team-range-input]")) {
    setHomeTeamRange(target.dataset.homeTeamRangeInput || "max", target.value);
    return;
  }
  if (target.matches("[data-flow-search]")) {
    DRAFT.wizardSearch = target.value;
    const q = target.value.trim().toLowerCase();
    document.querySelectorAll("[data-game-name]").forEach((el) => {
      const hay = `${el.dataset.gameName || ""} ${el.dataset.gameTag || ""}`.toLowerCase();
      el.hidden = Boolean(q) && !hay.includes(q);
    });
    return;
  }
  if (target.matches("[data-flow-modpack-custom]")) {
    DRAFT.modpackCustom = target.value.trim();
    DRAFT.modpack = DRAFT.modpackCustom;
  }
});

window.addEventListener("hashchange", () => {
  render();
  trackCurrentPage();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const routeName = parseRoute().name;
  if (routeName === "hero") void refreshHeroActivity();
  if (routeName === "home") void refreshHomeActivity();
  if (["matching", "room", "gameover"].includes(routeName)) {
    void refreshAuthenticatedState({ restoreRoute: true });
  }
});
window.addEventListener("error", (event) => {
  if (!state.authenticated) return;
  api.trackEvent("client_error", {
    kind: "error",
    route: parseRoute().name,
    message: String(event.message || "浏览器脚本错误").slice(0, 180),
  });
});
window.addEventListener("unhandledrejection", (event) => {
  if (!state.authenticated) return;
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "未处理的异步错误");
  api.trackEvent("client_error", {
    kind: "unhandledrejection",
    route: parseRoute().name,
    message: reason.slice(0, 180),
  });
});
window.addEventListener("beforeunload", () => {
  stopPresenceHeartbeat();
  clearTimers();
  destroyField();
  chatGeneration += 1;
  if (chatClose) chatClose();
  if (eventSourceClose) eventSourceClose();
});
window.addEventListener("pageshow", () => {
  markPresenceOnline();
  startPresenceHeartbeat();
  void refreshAuthenticatedState({ restoreRoute: true });
});
window.addEventListener("pagehide", () => {
  // Do not call /api/offline here. pagehide fires for ordinary refresh,
  // in-app navigation, BFCache transitions and transient browser teardown.
  // Only an explicit Leave or Logout may terminate a user's Session.
});

async function detectOnline() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      update({
        match: {
          ...state.match,
          online: data.online ?? state.match.online ?? 0,
          pool: data.matching ?? state.match.pool,
          playing: data.playing ?? state.match.playing,
        },
      });
    }
    return res.ok;
  } catch {
    return false;
  }
}

function mapAuthError(err) {
  const message = String(err?.message || err?.error_description || err || "");
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

async function handleAuthSuccess() {
  const session = await api.getSession();
  if (!session?.access_token) throw new Error("登录状态失效，请重试");
  const status = await api.sessionStatus();
  const profileReady = !!status.profile && Array.isArray(status.profile.genres) && status.profile.genres.length > 0;
  update({
    authenticated: true,
    authUsername: String(session.user?.user_metadata?.username || ""),
    authEmail: String(session.user?.email || ""),
    onboarded: profileReady,
    authError: "",
    authNotice: "",
  });
  if (profileReady) {
    let destination = "#/home";
    let hasActiveRoom = false;
    update({ user: status.profile });
    try {
      const snapshot = await api.getState();
      update({ user: snapshot.user });
      applyServerSnapshot(snapshot);
      hasActiveRoom = Boolean(snapshot.room);
      destination = snapshot.room
        ? "#/room"
        : snapshot.session?.status === "completed"
          ? "#/gameover"
          : state.match.status === "active"
            ? "#/matching"
            : "#/home";
    } catch {
      // profile-only state is enough to enter home
    }
    connectEvents();
    if (hasActiveRoom) replaceCanonicalRoute("#/room");
    else navigate(destination);
    toast(`欢迎回来，${state.user.nickname}`);
  } else {
    update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "男", games: [], genres: [], playStyle: "" } });
    navigate("#/welcome");
  }
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
    const profileReady = !!status.profile && Array.isArray(status.profile.genres) && status.profile.genres.length > 0;
    update({
      authenticated: true,
      authUsername: String(session.user?.user_metadata?.username || ""),
      authEmail: String(session.user?.email || ""),
      onboarded: profileReady,
      authError: "",
      authNotice: "",
    });
    if (profileReady) {
      update({ user: status.profile });
      try {
        const snapshot = await api.getState();
        update({ user: snapshot.user });
        applyServerSnapshot(snapshot);
        if (snapshot.room && ["home", "auth", "welcome", "matching"].includes(parseRoute().name)) {
          replaceCanonicalRoute("#/room");
        }
      } catch {
        // keep profile-only state
      }
    } else {
      update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "男", games: [], genres: [], playStyle: "" } });
    }
  } catch {
    resetState();
    if (recoveryCallback) update({ authMode: "reset", authError: "重置链接无效或已过期，请重新发送。", authNotice: "" });
  }
}

async function submitAuth() {
  const form = document.querySelector('[data-form="auth"]');
  if (!form) return;
  if (authSubmitPending) return;
  const submitBtn = form.querySelector('[data-action="auth-submit"]');
  if (submitBtn?.disabled) return;
  const fd = new FormData(form);
  const identifier = String(fd.get("identifier") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const passwordConfirm = String(fd.get("passwordConfirm") || "");
  const isRegister = state.authMode === "register";
  update({ authUsername: identifier, authEmail: email });
  if (!identifier || !password) {
    showAuthError("请输入用户名和密码");
    return;
  }
  if (isRegister) {
    if (/\s/.test(identifier) || !/^[\p{L}\p{N}_-]+$/u.test(identifier)) {
      showAuthError("用户名只能包含中文、字母、数字、下划线或短横线");
      return;
    }
    if (identifier.length < 2 || identifier.length > 24) {
      showAuthError("用户名需为 2-24 个字符");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      showAuthError("请输入有效的邮箱地址");
      return;
    }
  }
  if (password.length < 6) {
    showAuthError("密码至少 6 位");
    return;
  }
  if (isRegister && !passwordConfirm) {
    showAuthError("请再次输入密码", { preservePassword: true });
    return;
  }
  if (isRegister && password !== passwordConfirm) {
    showAuthError("两次输入的密码不一致", { preservePassword: true });
    return;
  }
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
        update({
          authMode: "login",
          authUsername: identifier,
          authEmail: email,
          authError: "",
          authNotice: "验证码已发送，请先完成邮箱验证。",
          authVerification: { email, username: identifier },
        });
        render();
        return;
      }
      const data = await api.loginByIdentifier(identifier, password);
      await api.signIn(data.email, password);
      await handleAuthSuccess();
    }, {
      label: isRegister ? "正在建立账号" : "正在验证玩家身份",
    });
  } catch (err) {
    showAuthError(mapAuthError(err));
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    showAuthError("请输入有效的邮箱地址");
    return;
  }
  forgotPasswordPending = true;
  const submitBtn = form.querySelector('[data-action="submit-forgot-password"]');
  if (submitBtn) submitBtn.disabled = true;
  update({ authEmail: email, authError: "", authNotice: "" });
  try {
    await api.requestPasswordReset(email);
    update({ authMode: "forgot", authEmail: email, authError: "", authNotice: "如果该邮箱已注册，重置邮件已经发送，请检查收件箱和垃圾邮件。" });
    render();
  } catch (err) {
    showAuthError(mapAuthError(err));
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
  if (password.length < 6) {
    showAuthError("密码至少 6 位", { preservePassword: true });
    return;
  }
  if (password !== passwordConfirm) {
    showAuthError("两次输入的密码不一致", { preservePassword: true });
    return;
  }
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
  } catch (err) {
    showAuthError(mapAuthError(err), { preservePassword: true });
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
      await handleAuthSuccess();
      return;
    }
    update({
      authVerification: null,
      authMode: "login",
      authError: "",
      authNotice: "邮箱已验证，请使用用户名或邮箱登录。",
    });
    render();
  } catch (err) {
    update({ authError: mapAuthError(err), authNotice: "" });
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
  } catch (err) {
    update({ authError: mapAuthError(err), authNotice: "" });
    render();
  } finally {
    verificationResendPending = false;
  }
}

function cancelEmailVerification() {
  update({ authVerification: null, authMode: "login", authError: "", authNotice: "" });
  render();
}

const [online] = await Promise.all([detectOnline(), restoreSession()]);
ONLINE = online;
if (ONLINE && state.authenticated && state.onboarded) connectEvents();
render();
trackCurrentPage();
await dismissHeroBoot();
