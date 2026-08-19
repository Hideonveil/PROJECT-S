import { icon } from "./icons.js";
import { avatar, avatarWrap, paintAvatars } from "./avatar.js";
import { initNodeField } from "./field.js";
import { button, esc, needSummary, setProductRailHeldOpen, toast } from "./ui.js";
import { state, update, resetState } from "./store.js";
import { DEVICES, GAME_BY_ID, GAMES, GENRES } from "./data.js";
import { FLOW } from "./flow.js";
import * as api from "./api.js";
import { authPage } from "./pages/auth.js";
import { landingPage } from "./pages/landing.js";
import { welcomePage } from "./pages/welcome.js";
import { homeFlowStepper, homePage } from "./pages/home.js";
import { communityPage } from "./pages/community.js";
import { matchingPage } from "./pages/matching.js";
import { roomPage } from "./pages/room.js";
import { gameoverPage } from "./pages/gameover.js";
import { connectionsPage } from "./pages/connections.js";
import { friendsPage } from "./pages/friends.js";
import { mePage } from "./pages/me.js";
import { withProjectTransition } from "./transition.js";

const app = document.getElementById("app");

const DRAFT = {
  nickname: state.user.nickname,
  avatarKey: state.user.avatarKey,
  device: state.user.device,
  gender: state.user.gender || "保密",
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
  voice: "on",
};
let homeStepperRevision = 0;
let activeField = null;
let timers = [];
let ONLINE = false;
let eventSourceClose = null;
let chatClose = null;
let wizardAdvanceTimer = null;
let roomExitReadyAt = 0;
let matchStartObserver = null;
let productTickerCleanup = null;
let targetCursorCleanup = null;
let matchRequestPending = false;
let staggeredRailCleanup = null;
let staggeredRailHoldOpen = false;

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
  if (staggeredRailHoldOpen) restoreOpen();

  staggeredRailCleanup = () => {
    window.clearTimeout(focusOutTimer);
    window.clearTimeout(pointerLeaveTimer);
    rail.removeEventListener("pointerenter", pointerEnter);
    rail.removeEventListener("pointerleave", pointerLeave);
    rail.removeEventListener("focusin", focusIn);
    rail.removeEventListener("focusout", focusOut);
    rail.removeEventListener("click", holdOpenOnNavigation);
    openTimeline?.kill();
    closeTween?.kill();
    gsap.killTweensOf([...layers, ...labels, ...secondary]);
  };
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
  if (currentTicker && nextTicker) nextTicker.replaceWith(currentTicker);
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
  update({ authMode: nextMode, authError: "", authNotice: "" });
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

function parseRoute() {
  const path = (location.hash || "#/hero").replace(/^#/, "") || "/hero";
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "home", id: parts[1] || "" };
}

function render() {
  clearTimers();
  clearWizardAdvance();
  destroyField();
  if (chatClose) {
    chatClose();
    chatClose = null;
  }
  const route = parseRoute();
  if (route.name !== "welcome") DRAFT.dirty = false;
  delete document.body.dataset.gameTheme;

  const publicRoutes = new Set(["hero", "home", "community", "auth"]);
  if (!state.authenticated && !publicRoutes.has(route.name)) {
    location.hash = "#/auth";
    return;
  }
  if (state.authenticated && !state.onboarded && route.name !== "welcome") {
    location.hash = "#/welcome";
    return;
  }
  if (state.authenticated && state.onboarded && (route.name === "auth" || route.name === "welcome")) {
    location.hash = "#/home";
    return;
  }

  let html = "";
  let immersive = false;

  switch (route.name) {
    case "hero":
      html = landingPage(state);
      break;
    case "auth":
      html = authPage(state);
      break;
    case "welcome":
      if (!DRAFT.dirty) prepareOnboardDraft();
      html = welcomePage(state, DRAFT);
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
      if (state.match.status !== "active") {
        navigate("#/home");
        return;
      }
      html = matchingPage(state);
      immersive = true;
      break;
    }
    case "room": {
      if (!state.room) {
        navigate("#/home");
        return;
      }
      html = roomPage(state);
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
      html = friendsPage(state);
      break;
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

  if (route.name === "home") {
    initMatchStartDock();
    initTargetCursor();
  }
  if (route.name === "matching") startMatchingFlow();
  if (route.name === "room" && state.room?.status === "playing") startRoomTimer();
  if (route.name === "room" && state.room?.id) {
    initRoomChat();
    initRoomExitCountdown();
  }
}

function prepareOnboardDraft() {
  DRAFT.nickname = state.user.nickname || state.authUsername || "";
  DRAFT.avatarKey = String(state.user.avatarKey || "").startsWith("data:") ? state.user.avatarKey : "";
  DRAFT.device = "";
  DRAFT.gender = "";
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
  DRAFT.needed = Math.min(4, Math.max(1, Number(state.need.target || 2) - Number(state.need.current || 1)));
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

function syncHomeFilterToDraft() {
  prepareNeedDraft();
  DRAFT.game = "deadlock";
  DRAFT.mode = HOME_FILTER.goal === "casual" ? "娱乐" : "排位 / 上分";
  DRAFT.goal = HOME_FILTER.goal === "casual" ? "娱乐" : "上分";
  DRAFT.rank = HOME_FILTER.rank;
  DRAFT.time = HOME_FILTER.time || "现在";
  DRAFT.current = 1;
  DRAFT.needed = HOME_FILTER.goal === "casual" ? Math.min(5, Math.max(1, Number(HOME_FILTER.team) || 1)) : 1;
  DRAFT.voice = HOME_FILTER.voice !== "off";
  DRAFT.voicePref = HOME_FILTER.voice;
  DRAFT.role = "";
  DRAFT.selectedTags = HOME_FILTER.goal === "casual"
    ? [`队友人数：${DRAFT.needed}`]
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
  const other =
    members.find((p) => p.id !== state.user.id && p.memberStatus === "active") ||
    members.find((p) => p.id !== state.user.id) ||
    members[0] ||
    {};
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
    members,
    status: room.status || "playing",
    startedAt: room.startedAt ? new Date(room.startedAt).getTime() : Date.now(),
    need: room.need || state.need,
    sessionId: room.sessionId || null,
    sessionStatus: room.sessionStatus || null,
    goodbyeRequests: room.goodbyeRequests || [],
    target: room.need?.target || state.need.target || 5,
  };
}

function roomShapeChanged(next, prev) {
  if (!next || !prev) return true;
  if (next.code !== prev.code || next.status !== prev.status) return true;
  if (JSON.stringify(next.need || {}) !== JSON.stringify(prev.need || {})) return true;
  if (JSON.stringify(next.goodbyeRequests || []) !== JSON.stringify(prev.goodbyeRequests || [])) return true;
  const memberShape = (member) => JSON.stringify([
    member.id,
    member.memberStatus || "active",
    member.exitedAt || "",
    member.nickname || member.name || "",
    member.avatarKey || "",
    member.gameAccounts || {},
  ]);
  const members = (next.members || []).map(memberShape).join("|");
  const oldMembers = (prev.members || []).map(memberShape).join("|");
  return members !== oldMembers;
}

function updateRoomView(nextRoom) {
  const root = document.querySelector(".room-page");
  if (!root || !nextRoom) return false;
  const partner = nextRoom.partner || {};
  const gameId = nextRoom.need?.game || state.need?.game;
  const accounts = partner.gameAccounts?.[gameId] || {};
  root.querySelectorAll("[data-partner-account-key]").forEach((row) => {
    const key = row.dataset.partnerAccountKey;
    const target = row.querySelector("[data-partner-account-value]");
    if (!target) return;
    const value = String(accounts[key] || "").trim();
    target.classList.toggle("dim", !value);
    target.classList.toggle("room-account-value", Boolean(value));
    target.innerHTML = value
      ? `${esc(value)}${button({ label: "复制", action: "copy-room-account", value, kind: "ghost", size: "sm", iconName: "copy" })}`
      : "对方还没填写";
  });

  const friendship = root.querySelector("[data-room-friendship]");
  if (friendship && partner.id) {
    const accepted = (state.friends || []).some((friend) => friend.id === partner.id);
    const incoming = (state.friendRequests?.incoming || []).some((request) => request.user?.id === partner.id);
    const outgoing = (state.friendRequests?.outgoing || []).some((request) => request.user?.id === partner.id);
    friendship.innerHTML = accepted
      ? `<span class="status-pill status-pill--live"><span class="dot"></span>已是 PROJECT-S 好友</span>`
      : incoming
        ? `<div class="room-friend-request"><strong>对方申请加你为好友</strong><div class="inline-actions">${button({ label: "接受", action: "accept-friend", value: partner.id, kind: "primary", size: "sm", iconName: "check" })}${button({ label: "拒绝", action: "reject-friend", value: partner.id, kind: "ghost", size: "sm", iconName: "x" })}</div></div>`
        : outgoing
          ? `<span class="status-pill"><span class="dot"></span>好友申请待确认</span>`
          : button({ label: "添加为 PROJECT-S 好友", action: "add-project-friend", value: partner.id, kind: "outline", iconName: "userPlus" });
  }
  const goodbye = root.querySelector("[data-room-goodbye-status]");
  if (goodbye) {
    const mine = (nextRoom.goodbyeRequests || []).some((request) => request.userId === state.user.id);
    const theirs = (nextRoom.goodbyeRequests || []).some((request) => request.userId !== state.user.id);
    goodbye.textContent = mine && theirs ? "双方都已拜拜" : mine ? "已提出拜拜，等待对方" : theirs ? "对方想结束这次匹配" : "";
    const actions = root.querySelector("[data-room-farewell-actions]");
    if (actions) actions.innerHTML = `${mine ? button({ label: "撤回", action: "withdraw-goodbye", kind: "ghost", iconName: "refreshCw" }) : ""}${button({ label: theirs && !mine ? "回应拜拜" : "拜拜", action: "say-goodbye", kind: "primary", extra: "connection-goodbye-button", iconName: "handshake", disabled: mine })}`;
  }
  return true;
}

function updateGameoverView() {
  const root = document.querySelector("[data-gameover-root]");
  const partner = state.session?.partner || {};
  if (!root) return false;
  const like = root.querySelector("[data-gameover-like]");
  if (like) {
    const liked = Boolean(state.session?.liked);
    like.classList.toggle("is-liked", liked);
    like.dataset.value = liked ? "no" : "yes";
    like.setAttribute("aria-pressed", String(liked));
    like.innerHTML = `${icon("heart", 22)}<span>${liked ? "已点赞" : "为 TA 点赞"}</span>`;
  }
  root.querySelectorAll('[data-action="set-room-rating"]').forEach((choice) => {
    const selected = choice.dataset.value === state.session?.rating;
    choice.classList.toggle("is-selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
  });
  const friendship = root.querySelector("[data-gameover-friendship]");
  if (friendship && partner.id) {
    const accepted = (state.friends || []).some((friend) => friend.id === partner.id);
    const incoming = (state.friendRequests?.incoming || []).some((request) => request.user?.id === partner.id);
    const outgoing = (state.friendRequests?.outgoing || []).some((request) => request.user?.id === partner.id);
    friendship.innerHTML = accepted
      ? `<span class="connection-friend-state is-connected">${icon("userCheck", 16)}已是好友</span>`
      : incoming
        ? `<div class="connection-friend-request"><span>对方申请加你为 PROJECT-S 好友</span><div class="inline-actions">${button({ label: "接受", action: "accept-friend", value: partner.id, kind: "primary", size: "sm", iconName: "check" })}${button({ label: "暂不", action: "reject-friend", value: partner.id, kind: "ghost", size: "sm", iconName: "x" })}</div></div>`
        : outgoing
          ? `<span class="connection-friend-state">${icon("clock", 16)}好友申请待确认</span>`
          : button({ label: "添加为 PROJECT-S 好友", action: "add-project-friend", value: partner.id, kind: "outline", iconName: "userPlus" });
  }
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
    confirmations,
  ]);
}

function updateMatchingView(previousMatch, nextMatch) {
  if (parseRoute().name !== "matching") return;
  const pair = nextMatch?.pair;
  const candidate = nextMatch?.candidate;
  const awaiting = pair?.state === "waiting_confirmation" && candidate;
  const mine = pair?.confirmations?.find((confirmation) => confirmation.user_id === state.user.id)?.decision;
  const theirs = pair?.confirmations?.find((confirmation) => confirmation.user_id !== state.user.id)?.decision;
  const confirmationCopy = mine === "accepted" && theirs === "accepted"
    ? "双方都已确定，正在建立房间。"
    : mine === "accepted"
      ? "你已准备，正在等对方确定。"
      : theirs === "accepted"
        ? "对方已确定，正在等你。"
        : "你们可以分别确定，不需要同时点击。";
  const title = document.getElementById("matching-modal-title");
  const desc = document.getElementById("match-desc");
  const mark = document.getElementById("matching-candidate-mark");
  const ready = document.getElementById("matching-ready-state");
  const me = document.getElementById("matching-ready-me");
  const them = document.getElementById("matching-ready-them");
  const actions = document.getElementById("matching-confirm-actions");
  const footer = document.getElementById("matching-footer-status");
  if (title) title.textContent = awaiting ? `找到 ${candidate.nickname || "一位玩家"}。` : "正在找同一局的人。";
  if (desc) desc.textContent = nextMatch.notice || (awaiting ? confirmationCopy : "先检查官方硬规则，再比较位置与麦克风偏好。");
  if (mark) mark.textContent = awaiting ? (candidate.nickname || "玩家").slice(0, 1) : "?";
  if (ready) ready.hidden = !awaiting;
  if (me) {
    me.classList.toggle("is-ready", mine === "accepted");
    me.innerHTML = `${icon(mine === "accepted" ? "check" : "clock", 15)}你：${mine === "accepted" ? "已确定" : "待确定"}`;
  }
  if (them) {
    them.classList.toggle("is-ready", theirs === "accepted");
    them.innerHTML = `${icon(theirs === "accepted" ? "check" : "clock", 15)}对方：${theirs === "accepted" ? "已确定" : "待确定"}`;
  }
  if (footer) footer.innerHTML = `<i></i>${awaiting ? "候选已暂时锁定，确认超时会自动回到匹配池。" : (nextMatch.notice || "匹配期间保持在线，我们会持续更新状态。")}`;
  if (actions) {
    actions.innerHTML = `${awaiting && mine !== "accepted" ? `<button type="button" data-action="reject-match"><span>不是这位</span>${icon("x", 16)}</button><button type="button" data-action="confirm-match"><span>确定是 TA</span>${icon("check", 16)}</button>` : ""}<button type="button" data-action="cancel-match"><span>退出匹配</span>${icon("x", 16)}</button>`;
  }
  const found = document.getElementById("match-found");
  if (found) found.textContent = awaiting ? "1" : "0";
  if (previousMatch?.pair?.state === "waiting_confirmation" && !pair) {
    document.querySelector("[data-matching-modal]")?.classList.add("matching-candidate-released");
    window.setTimeout(() => document.querySelector("[data-matching-modal]")?.classList.remove("matching-candidate-released"), 420);
  }
}

function applyMatchmakingSnapshot(snapshot, options = {}) {
  if (!snapshot) return;
  const previousMatch = state.match;
  const previousShape = matchmakingShape(state.match);
  const ticket = snapshot.ticket || null;
  const pair = snapshot.pair || null;
  const candidate = snapshot.candidate || null;
  const active = ticket && ["searching", "candidate_found", "waiting_confirmation", "matched", "playing"].includes(ticket.state);
  const timedOut = state.match?.pair?.state === "waiting_confirmation" && !pair && ticket?.state === "searching";
  const nextMatch = {
      ...state.match,
      status: active ? "active" : "idle",
      pool: snapshot.matching ?? state.match.pool,
      matchable: snapshot.matchable ?? state.match.matchable ?? 0,
      lifecycle: ticket,
      pair,
      candidate,
      notice: options.notice || (timedOut ? "对方没有接受，正在继续寻找其他玩家。" : (pair ? "" : state.match.notice || "")),
  };
  update({ match: nextMatch });
  const routeName = parseRoute().name;
  if (["matched", "playing"].includes(pair?.state) && pair.roomCode) {
    api.getState().then((snapshot) => {
      applyServerSnapshot(snapshot);
      if (snapshot.room && parseRoute().name === "matching") navigate("#/room");
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
  const patch = {
    match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool, playing: data.playing ?? state.match.playing },
  };
  if (data.matchmaking) {
    const mm = data.matchmaking;
    const timedOut = previousMatch?.pair?.state === "waiting_confirmation" && !mm.pair && mm.ticket?.state === "searching";
    patch.match = {
      ...patch.match,
      status: mm.ticket ? "active" : "idle",
      pool: mm.matching ?? patch.match.pool,
      matchable: mm.matchable ?? 0,
      lifecycle: mm.ticket || null,
      pair: mm.pair || null,
      candidate: mm.candidate || null,
      notice: mm.pair ? "" : (timedOut ? "对方没有接受，正在继续寻找其他玩家。" : previousMatch.notice || ""),
    };
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
  }
  const roomChanged = patch.room ? roomShapeChanged(patch.room, state.room) : false;
  update(patch);
  const friendRequestsChanged = previousFriendRequestShape !== JSON.stringify(state.friendRequests || {});
  const matchmakingChanged = previousMatchShape !== matchmakingShape(state.match);
  if (["home", "hero"].includes(routeName)) {
    const onlineEl = document.getElementById("home-online-count");
    const heroOnlineEl = document.getElementById("hero-online-count");
    const playingEl = document.getElementById("home-playing-count");
    if (onlineEl) onlineEl.textContent = String(Math.max(0, state.match.pool ?? 0));
    if (heroOnlineEl) heroOnlineEl.textContent = state.match.pool ? `${Math.max(0, state.match.pool)} 人正在摇人` : "正在等待下一位玩家";
    if (playingEl) playingEl.textContent = String(Math.max(0, state.match.playing ?? 0));
  }
  if (patch.room && routeName === "matching") {
    navigate("#/room");
  } else if (patch.room === null && routeName === "room") {
    render();
  } else if (patch.room && routeName === "room" && (roomChanged || friendRequestsChanged)) {
    updateRoomView(state.room);
  }
  if (routeName === "matching" && matchmakingChanged && !patch.room) updateMatchingView(previousMatch, state.match);
  if (patch.session) render();
}

async function confirmMatch(decision) {
  const pairId = state.match.pair?.id;
  if (!pairId || matchRequestPending) return;
  matchRequestPending = true;
  try {
    const snapshot = await api.confirmMatchmaking(pairId, decision);
    applyMatchmakingSnapshot(snapshot, { notice: decision === "rejected" ? "已跳过这位玩家，正在继续寻找。" : "" });
    if (decision === "rejected") toast("已拒绝，继续为你寻找其他玩家");
    if (["matched", "playing"].includes(snapshot.pair?.state) || snapshot.room) {
      const fullState = await api.getState();
      applyServerSnapshot(fullState);
      if (fullState.room) navigate("#/room");
    }
  } catch (error) {
    toast(error.message);
  } finally {
    matchRequestPending = false;
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
  if (isNewRoom && parseRoute().name === "matching") navigate("#/room");
  else if (parseRoute().name === "room") updateRoomView(normalized);
}

function handleServerGameOver(session) {
  if (!["completed", "cancelled"].includes(session?.status)) return;
  if (state.session && state.session.roomCode === session.roomCode) return;
  if (session.status === "cancelled") {
    update({
      room: null,
      session: null,
      match: { ...state.match, status: "idle", lifecycle: null, pair: null, candidate: null },
    });
    navigate("#/home");
    return;
  }
  const partner = state.room?.partner || state.session?.partner || {};
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const gameName = GAME_BY_ID[session.need?.game]?.name || session.need?.game || state.need.game || "游戏";
  const mode = session.need?.mode || state.need.mode || "";
  update({
    room: null,
    lastRoomCode: session.roomCode,
    session: {
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
  if (eventSourceClose) eventSourceClose();
  eventSourceClose = api.openEvents({
    hello: applyServerSnapshot,
    online: (data) => {
      const pool = data.matching ?? data.online ?? state.match.pool;
      const playing = data.playing ?? state.match.playing;
      update({ match: { ...state.match, pool, playing } });
      const routeName = parseRoute().name;
      if (routeName === "home") {
        render();
      } else if (routeName === "hero") {
        const heroOnlineEl = document.getElementById("hero-online-count");
        if (heroOnlineEl) heroOnlineEl.textContent = pool ? `${Math.max(0, pool)} 人正在摇人` : "正在等待下一位玩家";
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

function showAuthError(message, { preservePassword = false } = {}) {
  update({ authError: message });
  const form = document.querySelector('[data-form="auth"]');
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
  const userInput = form?.querySelector('[name="username"]');
  if (userInput) update({ authUsername: userInput.value.trim() });
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
  try {
    const messages = await api.fetchRoomMessages(room.id);
    renderChatMessages(messages);
  } catch {
    // history load is best-effort
  }
  try {
    const sb = await api.getSupabaseClient();
    const channel = sb.channel(`room-chat-${room.id}`);
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` }, (payload) => {
      appendChatMessage(payload.new);
    });
    await channel.subscribe();
    chatClose = () => sb.removeChannel(channel);
  } catch {
    // realtime chat is best-effort
  }
  const form = document.querySelector('[data-form="room-chat"]');
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendRoomChat();
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

async function sendRoomChat() {
  const room = state.room;
  const input = document.getElementById("chat-input");
  const text = input?.value.trim();
  if (!room?.id || !text) return;
  try {
    await api.sendRoomMessage(room.id, text, state.user.id);
    input.value = "";
  } catch (err) {
    toast(err.message || "消息发送失败");
  }
}

async function completeOnboard() {
  syncDraftFromDom("onboard");
  if (!DRAFT.nickname.trim() || !DRAFT.device || !DRAFT.genres.length || !DRAFT.gender) {
    toast("请完成昵称、设备、游戏类型和性别");
    return;
  }
  const user = {
    ...state.user,
    nickname: DRAFT.nickname,
    avatarKey: DRAFT.avatarKey,
    device: DRAFT.device,
    gender: DRAFT.gender || "保密",
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
  const step = Math.max(0, Math.min(4, Number(DRAFT.onboardStep) || 0));
  if (direction > 0) {
    const error =
      step === 0 && !DRAFT.nickname.trim() ? "请先输入玩家昵称" :
      step === 2 && !DRAFT.device ? "请选择常用设备" :
      step === 3 && !DRAFT.genres.length ? "请至少选择一个游戏类型" :
      step === 4 && !DRAFT.gender ? "请选择性别" : "";
    if (error) {
      toast(error);
      return;
    }
  }
  DRAFT.onboardStep = Math.max(0, Math.min(4, step + direction));
  DRAFT.onboardDirection = direction < 0 ? -1 : 1;
  DRAFT.dirty = true;
  render();
}

async function startMatch() {
  if (matchRequestPending) return;
  DRAFT.dirty = false;
  const desiredRoles = (DRAFT.selectedTags || [])
    .map((tag) => Number(String(tag).match(/[1-6]/)?.[0]))
    .filter((role) => role >= 1 && role <= 6);
  const matchInput = {
    gameId: "deadlock",
    mode: DRAFT.goal === "娱乐" ? "casual" : "ranked",
    rankCode: DRAFT.goal === "娱乐" ? null : DRAFT.rank || null,
    desiredRoles,
    microphonePreference: ["on", "off", "any"].includes(DRAFT.voicePref) ? DRAFT.voicePref : (DRAFT.voice === false ? "off" : "on"),
  };
  const need = {
    game: "deadlock", mode: DRAFT.mode, goal: DRAFT.goal, current: 1, target: 2,
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
          status: "active",
          pool: data.matching ?? state.match.pool,
          playing: data.playing ?? state.match.playing,
          matchable: data.matchable ?? 0,
          lifecycle: data.ticket || null,
          pair: data.pair || null,
          candidate: data.candidate || null,
        },
      });
      navigate("#/matching");
    }, {
      label: "正在进入匹配池",
      immediate: true,
    });
  } catch (err) {
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
    if (timeEl) timeEl.textContent = `${Math.floor(elapsed)}s`;
    if (foundEl) foundEl.textContent = state.match.pair ? "1" : "0";
    if (titleEl) titleEl.textContent = elapsed > 3 ? "正在锁定合适玩家" : "正在扫描匹配池";
    const steps = document.querySelectorAll(".matching-modal-step");
    if (steps.length === 3) {
      steps[1].classList.toggle("is-active", elapsed < 3);
      steps[1].classList.toggle("is-done", elapsed >= 3);
      steps[2].classList.toggle("is-active", elapsed >= 3);
    }
  }, 350);
  timers.push(interval);
  const sync = window.setInterval(async () => {
    try {
      applyMatchmakingSnapshot(await api.getMatchmakingStatus());
    } catch {
      // Realtime remains primary; heartbeat polling is a resilience path.
    }
  }, 3000);
  timers.push(sync);
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

function finishGame() {
  const partner = state.room?.partner;
  if (!partner) return;
  if (!state.room?.code || !ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  const partnerRequested = (state.room.goodbyeRequests || []).some((request) => request.userId !== state.user.id);
  closeSheet();
  showSheet(`<div class="sheet connection-goodbye-confirm" role="dialog" aria-modal="true" aria-label="确定要拜拜吗">
    <div class="sheet-head"><h2 class="sheet-title">确定要拜拜吗？</h2><button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button></div>
    <div class="profile-identity">${avatarWrap(partner.avatarKey, 58, partner.online)}<div><div class="profile-name"><strong>${esc(partner.name || "对方玩家")}</strong></div><div class="profile-handle">${partnerRequested ? "对方已经提出拜拜，确认后本次连接会结束。" : "你的选择会先告诉对方，双方确认后才结束。"}</div></div></div>
    <div class="form-actions">${button({ label: "再玩一会", action: "close-sheet", kind: "ghost" })}${button({ label: "确认拜拜", action: "confirm-goodbye", kind: "primary", iconName: "handshake" })}</div>
  </div>`);
}

async function setGoodbyeRequest(requested) {
  const room = state.room;
  if (!room?.code || !ONLINE) return toast("服务暂不可用，请稍后重试");
  try {
    const result = await api.requestRoomGoodbye(room.code, requested);
    closeSheet();
    if (result.room) {
      const normalized = normalizeServerRoom(result.room);
      update({ room: normalized });
      updateRoomView(normalized);
    }
    if (result.session && ["completed", "cancelled"].includes(result.session.status)) {
      handleServerGameOver(result.session);
      return;
    }
    toast(requested ? "已提出拜拜，正在等对方回应" : "已撤回拜拜");
  } catch (err) {
    toast(err.message);
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
    if (liked) toast("已给对方点赞");
  } catch (err) {
    if (state.session?.liked === liked) {
      update({ session: { ...state.session, liked: previousLiked } });
      updateGameoverView();
    }
    toast(err.message);
  }
}

function exitRoomPrompt() {
  const partner = state.room?.partner;
  if (!partner) return;
  closeSheet();
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="主动离开游戏">
      <div class="sheet-head">
        <h2 class="sheet-title">确定主动离开？</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <div class="profile-identity" style="margin-bottom:14px">
        ${avatarWrap(partner.avatarKey, 56, partner.online)}
        <div>
          <div class="profile-name"><strong>${esc(partner.name || "玩家")}</strong></div>
          <div class="profile-handle">${esc(partner.device || "PC")} · 这属于异常退出，不计入正常对局</div>
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
  const partner = room.partner || {};
  try {
    const result = await withProjectTransition(
      () => api.roomAction(room.code, "exit"),
      { label: "正在退出 Session" },
    );
    if (result.session && ["completed", "cancelled"].includes(result.session.status)) {
      closeSheet();
      update({ room: null, session: null, match: { ...state.match, status: "idle", lifecycle: null, pair: null, candidate: null } });
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
      lastRoomCode: room.code,
      session: {
        partner: { ...partner },
        roomCode: room.code,
        title,
        time,
        rating: null,
        wantAgain: null,
      },
    });
    navigate("#/home");
    toast("已主动离开，本次不计入正常对局");
  } catch (err) {
    toast(err.message);
  }
}

async function saveRoomGameAccount() {
  const form = document.querySelector('[data-form="room-account"]');
  if (!form || !ONLINE) return;
  const gameId = state.need?.game || state.room?.need?.game;
  if (!gameId) return;
  const fd = new FormData(form);
  const next = {
    ...(state.user.gameAccounts || {}),
    [gameId]: { ...((state.user.gameAccounts || {})[gameId] || {}) },
  };
  for (const [key, value] of fd.entries()) {
    next[gameId][key] = String(value || "").trim();
  }
  try {
    const data = await api.updateProfile({ gameAccounts: next });
    update({ user: { ...state.user, ...data.user } });
    toast("游戏账号已保存，对方会自动看到");
  } catch (err) {
    toast(err.message);
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
    match: { ...state.match, status: "idle", lifecycle: null, pair: null, candidate: null },
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
  if (ONLINE) await api.cancelMatchmaking().catch(() => {});
  update({ match: { ...state.match, status: "idle", lifecycle: null, pair: null, candidate: null } });
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
  if (ONLINE && state.authenticated) {
    api.cancelMatchmaking("logout").catch(() => {});
    api.goOffline();
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

async function addProjectFriend(targetUserId, { fromRoom = false } = {}) {
  if (!ONLINE) {
    toast("在线版才支持添加好友");
    return;
  }
  update({ friendSearchStatus: "adding", friendSearchError: "" });
  if (!fromRoom) render();
  try {
    const data = await api.addFriend({ targetUserId });
    update({
      friends: mapServerFriends(data.friends),
      friendRequests: mapServerFriendRequests(data.friendRequests),
      friendSearchResult: data.status === "accepted" ? null : state.friendSearchResult,
      friendSearchStatus: "idle",
    });
    if (parseRoute().name === "room") updateRoomView(state.room);
    else if (parseRoute().name === "gameover") updateGameoverView();
    else render();
    toast(data.status === "accepted" ? `你和 ${data.user.nickname || "对方"} 已成为 PROJECT-S 好友` : "好友申请已发送，等待对方确认");
  } catch (err) {
    update({ friendSearchStatus: "idle", friendSearchError: err.message });
    if (!fromRoom) render();
    else toast(err.message);
  }
}

async function respondProjectFriend(requesterId, decision) {
  if (!ONLINE) return toast("在线版才支持处理好友申请");
  try {
    const data = await api.respondFriend(requesterId, decision);
    update({ friends: mapServerFriends(data.friends), friendRequests: mapServerFriendRequests(data.friendRequests) });
    if (parseRoute().name === "room") updateRoomView(state.room);
    else if (parseRoute().name === "gameover") updateGameoverView();
    else render();
    toast(decision === "accepted" ? "已接受好友申请" : "已拒绝好友申请");
  } catch (err) {
    toast(err.message);
  }
}

function openFeedback() {
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="反馈">
      <div class="sheet-head">
        <h2 class="sheet-title">反馈问题或建议</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <form data-form="feedback" style="display:flex;flex-direction:column;gap:16px">
        <div class="field">
          <label class="label" for="feedback-category">类型</label>
          <select class="select" id="feedback-category" name="category">
            <option value="bug">发现 Bug</option>
            <option value="suggestion">功能建议</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="feedback-message">描述</label>
          <textarea class="textarea" id="feedback-message" name="message" placeholder="发生了什么，或你希望怎么改进" required></textarea>
        </div>
        <div class="field">
          <label class="label" for="feedback-contact">联系方式 <span class="label-note">可选，方便回复你</span></label>
          <input class="input" id="feedback-contact" name="contact" placeholder="微信号 / QQ / 邮箱" />
        </div>
        <div class="form-actions">
          ${button({ label: "提交反馈", action: "submit-feedback", kind: "primary", iconName: "send", extra: "btn--block" })}
        </div>
      </form>
    </div>
  `);
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
  if (ONLINE) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "提交中…";
    }
    const requestId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await withProjectTransition(async () => {
        await api.sendFeedback({
          category: fd.get("category") || "bug",
          message,
          contact: String(fd.get("contact") || "").trim(),
          requestId,
          currentPage: location.hash || "/",
          currentGame: state.need?.game || state.user?.games?.[0]?.gameId || null,
        });
        closeSheet();
        toast("反馈已收到，感谢你的反馈。");
      }, { label: "正在提交反馈" });
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
    if (action === "home-team") HOME_FILTER.team = value;
    if (action === "home-time") HOME_FILTER.time = value;
    selectHomeChoice(actionEl);
    return;
  }

  if (action === "home-wizard-next") {
    const stepKey = homeWizardStepKey();
    const error =
      stepKey === "goal" && !HOME_FILTER.goal ? "请选择游戏目的" :
      stepKey === "rank" && !HOME_FILTER.rank ? "请选择当前段位" :
      stepKey === "roles" && !HOME_FILTER.ownRoles.length ? "请选择自己的位置，或选择不限" :
      stepKey === "roles" && !HOME_FILTER.teammateRoles.length ? "请选择希望队友的位置，或选择不限" :
      stepKey === "team" && !Number(HOME_FILTER.team) ? "请选择希望寻找的队友人数" : "";
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
    "go-friends": () => navigate("#/friends"),
    "open-auth-login": () => enterAuth("login"),
    "open-auth-register": () => enterAuth("register"),
    "switch-auth-mode": (value) => {
      const username = document.querySelector("#auth-username")?.value?.trim() || state.authUsername;
      const mode = value === "register" ? "register" : "login";
      update({ authMode: mode, authUsername: username, authError: "", authNotice: "" });
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
    "onboard-next": () => moveOnboardStep(1),
    "onboard-back": () => moveOnboardStep(-1),
    "complete-onboard": completeOnboard,
    "start-match": startMatch,
    "cancel-match": cancelMatch,
    "confirm-match": () => confirmMatch("accepted"),
    "reject-match": () => confirmMatch("rejected"),
    "open-room": () => navigate("#/room"),
    "leave-room": exitRoomPrompt,
    "exit-room": exitRoomPrompt,
    "confirm-exit-room": confirmExitRoom,
    "save-room-account": saveRoomGameAccount,
    "copy-room-account": (value) => {
      api.trackEvent("game_account_copied", { gameId: state.need?.game || null, roomId: state.room?.id || null });
      copyText(value);
    },
    "add-project-friend": (value) => addProjectFriend(value, { fromRoom: true }),
    "set-room-rating": (value) => setRoomRating(value),
    "rematch-recent": (id) => rematchRecent(id),
    "back-to-match": returnToMatchingSetup,
    "go-recent": () => navigate("#/connections"),
    "say-goodbye": finishGame,
    "confirm-goodbye": () => setGoodbyeRequest(true),
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
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
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

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", () => {
  clearTimers();
  destroyField();
  if (chatClose) chatClose();
  if (eventSourceClose) eventSourceClose();
  if (ONLINE && state.authenticated) api.goOffline();
});

async function detectOnline() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      update({
        match: {
          ...state.match,
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
  if (message.includes("User already registered") || message.includes("email_exists")) return "用户名已存在，请直接登录";
  if (message.includes("Password should be at least")) return "密码至少 6 位";
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("fetch")) return "网络连接失败，请检查网络后重试";
  if (message.includes("Missing password")) return "请输入密码";
  return message || "操作失败，请稍后重试";
}

async function handleAuthSuccess() {
  const session = await api.getSession();
  if (!session?.access_token) throw new Error("登录状态失效，请重试");
  const status = await api.sessionStatus();
  update({
    authenticated: true,
    authUsername: String(session.user?.user_metadata?.username || ""),
    onboarded: !!status.profile,
    authError: "",
    authNotice: "",
  });
  if (status.profile) {
    update({ user: status.profile });
    try {
      const snapshot = await api.getState();
      update({ user: snapshot.user });
      applyServerSnapshot(snapshot);
    } catch {
      // profile-only state is enough to enter home
    }
    connectEvents();
    navigate("#/home");
    toast(`欢迎回来，${state.user.nickname}`);
  } else {
    update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "", games: [], genres: [], playStyle: "" } });
    navigate("#/welcome");
  }
}

async function restoreSession() {
  try {
    const session = await api.getSession();
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
    update({
      authenticated: true,
      authUsername: String(session.user?.user_metadata?.username || ""),
      onboarded: !!status.profile,
      authError: "",
      authNotice: "",
    });
    if (status.profile) {
      update({ user: status.profile });
      try {
        const snapshot = await api.getState();
        update({ user: snapshot.user });
        applyServerSnapshot(snapshot);
      } catch {
        // keep profile-only state
      }
    } else {
      update({ user: { ...state.user, nickname: "", avatarKey: "", device: "", gender: "", games: [], genres: [], playStyle: "" } });
    }
  } catch {
    resetState();
  }
}

async function submitAuth() {
  const form = document.querySelector('[data-form="auth"]');
  if (!form) return;
  const submitBtn = form.querySelector('[data-action="auth-submit"]');
  if (submitBtn?.disabled) return;
  const fd = new FormData(form);
  const username = String(fd.get("username") || "").trim();
  const password = String(fd.get("password") || "");
  const passwordConfirm = String(fd.get("passwordConfirm") || "");
  update({ authUsername: username });
  if (!username || !password) {
    showAuthError("请输入用户名和密码");
    return;
  }
  if (/\s/.test(username)) {
    showAuthError("用户名不能包含空格");
    return;
  }
  if (username.length < 2 || username.length > 24) {
    showAuthError("用户名需为 2-24 个字符");
    return;
  }
  if (password.length < 6) {
    showAuthError("密码至少 6 位");
    return;
  }
  if (state.authMode === "register" && !passwordConfirm) {
    showAuthError("请再次输入密码", { preservePassword: true });
    return;
  }
  if (state.authMode === "register" && password !== passwordConfirm) {
    showAuthError("两次输入的密码不一致", { preservePassword: true });
    return;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    const label = submitBtn.querySelector("span");
    if (label) label.textContent = "提交中…";
  }
  update({ authError: "", authNotice: "" });
  document.querySelector("[data-auth-error]")?.remove();
  try {
    await withProjectTransition(async () => {
      const data = state.authMode === "register"
        ? await api.registerAccount(username, password)
        : await api.loginByUsername(username, password);
      await api.signIn(data.email, password);
      await handleAuthSuccess();
    }, {
      label: state.authMode === "register" ? "正在建立账号" : "正在验证玩家身份",
    });
  } catch (err) {
    showAuthError(mapAuthError(err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      const label = submitBtn.querySelector("span");
      if (label) label.textContent = state.authMode === "register" ? "注册" : "登录";
    }
  }
}

const [online] = await Promise.all([detectOnline(), restoreSession()]);
ONLINE = online;
if (ONLINE && state.authenticated && state.onboarded) connectEvents();
render();
