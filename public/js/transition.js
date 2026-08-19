import { icon } from "./icons.js";

const DEVICE_ICONS = ["keyboard", "mouse", "headphones", "pc", "vr", "monitor"];

const TAPE_COPY = "总有人想一起玩 / NEVER PLAY ALONE / CONNECTING PLAYERS / ".repeat(4);
let activeTransition = null;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
const customIcon = (body) => `<svg class="icon" width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

function deviceIcon(name) {
  if (name === "mouse") return customIcon('<rect x="5" y="2" width="14" height="20" rx="7"></rect><path d="M12 6v4"></path>');
  if (name === "pc") return customIcon('<rect x="6" y="2" width="12" height="20" rx="2"></rect><path d="M9 6h6"></path><circle cx="12" cy="16" r="2"></circle>');
  if (name === "vr") return customIcon('<path d="M4 8h16a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3h-2.2a2 2 0 0 1-1.6-.8L13.6 15h-3.2l-1.6 2.2a2 2 0 0 1-1.6.8H5a3 3 0 0 1-3-3v-5a2 2 0 0 1 2-2Z"></path><path d="M7 8 8.5 5h7L17 8"></path>');
  return icon(name, 88);
}

function transitionMarkup(label) {
  const tape = `<span>${TAPE_COPY}</span><span aria-hidden="true">${TAPE_COPY}</span>`;
  return `<div class="project-transition" data-project-transition role="status" aria-live="assertive" aria-label="${label}">
    <div class="project-transition-tape project-transition-tape--top" aria-hidden="true"><div class="project-transition-tape-track">${tape}</div></div>
    <div class="project-transition-center">
      <div class="project-transition-devices" aria-hidden="true">
        ${DEVICE_ICONS.map((name, index) => `<span class="project-transition-device" style="--device-index:${index}">${deviceIcon(name)}</span>`).join("")}
      </div>
    </div>
    <div class="project-transition-tape project-transition-tape--bottom" aria-hidden="true"><div class="project-transition-tape-track">${tape}</div></div>
  </div>`;
}

function showTransition(label) {
  if (activeTransition?.isConnected) return activeTransition;
  const template = document.createElement("template");
  template.innerHTML = transitionMarkup(label);
  const overlay = template.content.firstElementChild;
  if (!overlay) return null;
  document.body.appendChild(overlay);
  document.body.classList.add("is-project-transitioning");
  activeTransition = overlay;
  window.requestAnimationFrame(() => overlay.classList.add("is-visible"));
  return overlay;
}

async function hideTransition(overlay) {
  if (!overlay?.isConnected) return;
  overlay.classList.add("is-leaving");
  await Promise.race([
    new Promise((resolve) => {
      const onEnd = (event) => {
        if (event.target !== overlay) return;
        overlay.removeEventListener("animationend", onEnd);
        resolve();
      };
      overlay.addEventListener("animationend", onEnd);
    }),
    wait(520),
  ]);
  overlay.remove();
  if (activeTransition === overlay) activeTransition = null;
  if (!activeTransition) document.body.classList.remove("is-project-transitioning");
}

export async function dismissHeroBoot() {
  const overlay = document.querySelector("[data-hero-loader]");
  if (!overlay) return;
  if (document.documentElement.dataset.initialRoute !== "hero") {
    overlay.remove();
    return;
  }
  const startedAt = Number(window.__JIYUAN_BOOT_AT__) || performance.now();
  await wait(520 - (performance.now() - startedAt));
  overlay.classList.add("is-leaving");
  await Promise.race([
    new Promise((resolve) => overlay.addEventListener("animationend", resolve, { once: true })),
    wait(760),
  ]);
  overlay.remove();
}

export async function withProjectTransition(task, options = {}) {
  const {
    label = "正在连接",
    immediate = false,
    delay = immediate ? 0 : 240,
    minDuration = immediate ? 480 : 360,
  } = options;
  let overlay = null;
  let shownAt = 0;
  const reveal = () => {
    overlay = showTransition(label);
    shownAt = performance.now();
  };
  const revealTimer = delay > 0 ? window.setTimeout(reveal, delay) : null;
  if (delay <= 0) reveal();

  try {
    return await task();
  } finally {
    if (revealTimer !== null) window.clearTimeout(revealTimer);
    if (overlay) {
      await wait(minDuration - (performance.now() - shownAt));
      await hideTransition(overlay);
    }
  }
}
