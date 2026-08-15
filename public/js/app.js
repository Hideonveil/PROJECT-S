import { icon } from "./icons.js";
import { avatar, avatarWrap, paintAvatars } from "./avatar.js";
import { initNodeField } from "./field.js";
import { button, esc, needSummary, shell, toast } from "./ui.js";
import { state, update, resetState } from "./store.js";
import { DEVICES, GAME_BY_ID, GAMES, GENRES, HOME_CASUAL_TIMES, HOME_COMPETITIVE_GAME_IDS, HOME_GAME_IDS, HOME_RANK_TIMES } from "./data.js";
import { FLOW } from "./flow.js";
import * as api from "./api.js";
import { authPage } from "./pages/auth.js";
import { welcomePage } from "./pages/welcome.js";
import { homePage } from "./pages/home.js";
import { needPage, confirmSummary } from "./pages/need.js";
import { matchingPage } from "./pages/matching.js";
import { resultsPage } from "./pages/results.js";
import { profilePage } from "./pages/profile.js";
import { roomPage } from "./pages/room.js";
import { gameoverPage } from "./pages/gameover.js";
import { connectionsPage } from "./pages/connections.js";
import { friendsPage } from "./pages/friends.js";
import { mePage } from "./pages/me.js";

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
  dirty: false,
};

const HOME_FILTER = {
  game: GAMES[0].id,
  mode: GAMES[0].modes[0] || "",
  time: "现在就玩",
  team: "1",
  voice: "需要",
  step: 1,
};
let activeField = null;
let timers = [];
let ONLINE = false;
let eventSourceClose = null;
let chatClose = null;
let wizardAdvanceTimer = null;
let roomExitReadyAt = 0;

function clearTimers() {
  timers.forEach((t) => {
    window.clearTimeout(t);
    window.clearInterval(t);
  });
  timers = [];
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

function parseRoute() {
  const path = (location.hash || "#/home").replace(/^#/, "") || "/home";
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
  if (route.name !== "need" && route.name !== "welcome") DRAFT.dirty = false;
  if (route.name === "need" && DRAFT.game) document.body.dataset.gameTheme = DRAFT.game;
  else delete document.body.dataset.gameTheme;

  if (!state.authenticated && route.name !== "auth") {
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
    case "auth":
      html = authPage(state);
      break;
    case "welcome":
      if (!DRAFT.dirty) prepareOnboardDraft();
      html = welcomePage(state, DRAFT);
      break;
    case "home":
      html = homePage(state);
      break;
    case "connections":
      html = connectionsPage(state);
      break;
    case "need":
      if (!DRAFT.dirty) prepareNeedDraft();
      html = needPage(state, DRAFT);
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
    case "results": {
      if (!state.match.candidates.length) {
        navigate("#/home");
        return;
      }
      html = resultsPage(state);
      break;
    }
    case "player": {
      const candidate = findCandidate(route.id);
      if (!candidate) {
        navigate("#/results");
        return;
      }
      html = profilePage(state, candidate);
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
      navigate("#/home");
      return;
  }

  document.body.dataset.immersive = immersive ? "true" : "";
  app.innerHTML = html;
  paintAvatars(app);
  activeField = initNodeField(app);


  if (route.name === "matching") startMatchingFlow();
  if (route.name === "room" && state.room?.status === "playing") startRoomTimer();
  if (route.name === "room" && state.room?.id) {
    initRoomChat();
    initRoomExitCountdown();
  }
}

function prepareOnboardDraft() {
  DRAFT.nickname = state.user.nickname || state.authUsername || "";
  DRAFT.avatarKey = state.user.avatarKey || "me-1";
  DRAFT.device = state.user.device || "PC";
  DRAFT.gender = state.user.gender || "保密";
  DRAFT.genres = state.user.genres || [];
  DRAFT.playStyle = state.user.playStyle || "";
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

function homeFilterCompetitive(gameId) {
  return HOME_COMPETITIVE_GAME_IDS.includes(gameId);
}

function renderHomeFilterGameState() {
  document.querySelectorAll("[data-home-game]").forEach((row) => {
    row.classList.toggle("is-on", row.dataset.homeGame === HOME_FILTER.game);
  });
}

function renderHomeFilterTags() {
  const modeWrap = document.getElementById("home-filter-mode-tags");
  const timeWrap = document.getElementById("home-filter-time-tags");
  const game = GAMES.find((g) => g.id === HOME_FILTER.game) || GAMES[0];
  const competitive = homeFilterCompetitive(game.id);
  const times = competitive ? HOME_RANK_TIMES : HOME_CASUAL_TIMES;
  if (modeWrap) {
    modeWrap.innerHTML = (game.modes || [])
      .map(
        (m) =>
          `<button type="button" class="home-filter-tag ${m === HOME_FILTER.mode ? "is-on" : ""}" data-action="home-mode" data-value="${esc(m)}">${esc(m)}</button>`
      )
      .join("");
  }
  if (timeWrap) {
    timeWrap.innerHTML = times
      .map(
        (t) =>
          `<button type="button" class="home-filter-tag ${t === HOME_FILTER.time ? "is-on" : ""}" data-action="home-time" data-value="${esc(t)}">${esc(t)}</button>`
      )
      .join("");
  }
  const timeLabel = document.getElementById("home-filter-time-label");
  const timeTitle = document.getElementById("home-filter-time-title");
  const timeSub = document.getElementById("home-filter-time-sub");
  if (timeLabel) timeLabel.textContent = competitive ? "局数" : "时间";
  if (timeTitle) timeTitle.textContent = competitive ? "想打几局？" : "什么时候玩？";
  if (timeSub) timeSub.textContent = competitive ? "选择本次对局的局数。" : "确定本次匹配的启动时间。";
}
function renderHomeFilterConfirm() {
  const wrap = document.getElementById("home-filter-confirm-summary");
  if (!wrap) return;
  const game = GAMES.find((g) => g.id === HOME_FILTER.game) || GAMES[0];
  const flow = FLOW[game.id] || {};
  const draft = {
    game: game.id,
    mode: HOME_FILTER.mode || game.modes[0] || "",
    goal: flow.goalByMode?.[HOME_FILTER.mode] || "",
    current: 1,
    needed: Math.min(4, Math.max(1, Number(HOME_FILTER.team) || 1)),
    time: HOME_FILTER.time || "现在就玩",
    duration: homeFilterCompetitive(game.id) ? "不限" : "60",
    voice: HOME_FILTER.voice !== "不需要",
    voicePref: HOME_FILTER.voice || "都可以",
    style: "",
    selectedTags: [],
  };
  wrap.innerHTML = confirmSummary(draft);
}

function renderHomeFilterStep() {
  const panels = ["game", "mode", "team", "time", "voice", "confirm"];
  const step = Math.max(1, Math.min(6, Number(HOME_FILTER.step) || 1));
  HOME_FILTER.step = step;
  document.querySelectorAll("[data-home-panel]").forEach((panel) => {
    panel.classList.toggle("is-show", panel.dataset.homePanel === panels[step - 1]);
  });
  document.querySelectorAll("[data-home-step]").forEach((el, i) => {
    el.classList.toggle("is-done", i < step - 1);
    el.classList.toggle("is-on", i === step - 1);
  });
  const hint = document.getElementById("home-filter-hint");
  if (hint) hint.textContent = `${step} / 6`;
  const back = document.querySelector("[data-action='home-filter-back']");
  const disabled = step === 1;
  if (back) {
    back.classList.toggle("is-disabled", disabled);
    back.disabled = disabled;
  }
  const next = document.querySelector("[data-action='home-filter-next']");
  if (next) {
    const final = step === 6;
    next.classList.toggle("is-final", final);
    next.innerHTML = final ? "开始匹配" : `下一步${icon("arrowRight", 16)}`;
  }
  if (step === 6) renderHomeFilterConfirm();
}
function renderHomeFilterState() {
  renderHomeFilterGameState();
  renderHomeFilterTags();
  renderHomeFilterStep();
}

function showHomeFilter(open) {
  const overlay = document.querySelector("[data-home-filter]");
  if (!overlay) return;
  overlay.hidden = !open;
  const diamond = document.querySelector(".home-diamond");
  diamond?.setAttribute("aria-expanded", String(open));
  if (open) renderHomeFilterState();
}
function syncHomeFilterToDraft() {
  prepareNeedDraft();
  const game = GAMES.find((g) => g.id === HOME_FILTER.game) || GAMES[0];
  DRAFT.game = game.id;
  DRAFT.mode = HOME_FILTER.mode || game.modes[0] || "";
  const flow = FLOW[DRAFT.game] || {};
  DRAFT.goal = flow.goalByMode?.[DRAFT.mode] || "";
  DRAFT.time = HOME_FILTER.time || "现在就玩";
  DRAFT.current = 1;
  DRAFT.needed = Math.min(4, Math.max(1, Number(HOME_FILTER.team) || 1));
  DRAFT.voice = HOME_FILTER.voice !== "不需要";
  DRAFT.voicePref = HOME_FILTER.voice || "都可以";
  DRAFT.dirty = true;
}

function startHomeFilter() {
  syncHomeFilterToDraft();
  startMatch();
}
function findCandidate(id) {
  const fromRecent = state.recentConnections?.find((c) => c.id === id);
  if (fromRecent) {
    return {
      id: fromRecent.id,
      name: fromRecent.name || "玩家",
      nickname: fromRecent.name || "玩家",
      handle: fromRecent.handle || `${fromRecent.name || "玩家"}#${String(fromRecent.id).slice(-4)}`,
      avatarKey: fromRecent.avatarKey,
      device: "PC",
      online: fromRecent.online !== false,
      games: [],
      genres: [],
      playStyle: "",
      kind: "player",
      need: state.need,
      reasons: ["最近一起玩过"],
    };
  }
  return (
    state.match.candidates?.find((c) => c.id === id) ||
    state.room?.members?.find((m) => m.id === id) ||
    null
  );
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
  if (page === "need") {
    const form = document.querySelector('[data-form="need"]');
    if (!form) return;
    const fd = new FormData(form);
    DRAFT.goal = String(fd.get("goal") || "").trim() || DRAFT.goal;
    DRAFT.time = String(fd.get("time") || DRAFT.time);
    DRAFT.playerType = String(fd.get("playerType") || "").trim() || DRAFT.playerType;
    const voiceInput = form.querySelector('[name="voice"]');
    if (voiceInput) DRAFT.voice = voiceInput.checked;
  }
}

function normalizeCandidates(list) {
  return (list || []).map((c, index) => ({
    id: c.id,
    kind: c.kind || "player",
    name: c.nickname || c.name || "玩家",
    handle: c.handle || `${c.nickname || "玩家"}#${String(c.id).slice(-4)}`,
    avatarKey: c.avatarKey,
    device: c.device || "PC",
    online: c.online !== false,
    games: c.games || [],
    genres: c.genres || [],
    playStyle: c.playStyle || "",
    need: c.need || state.need,
    reasons: c.reasons?.length ? c.reasons : ["此刻在线 · 真人玩家", "匹配池实时候选"],
    compat: [
      { label: "实时", text: "真人玩家，此刻在线等待", score: 90 },
      { label: "需求", text: c.need?.goal || "正在寻找队友", score: 85 },
    ],
    matchScore: c.matchScore || 100 - index * 3,
  }));
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
    startedAt: room.startedAt || 0,
    target: room.need?.target || state.need.target || 5,
  };
}

function snapshotCandidates(data) {
  if (!state.need) return null;
  const routeName = parseRoute().name;
  if (!["matching", "results"].includes(routeName)) return null;
  const list = (data.needs || []).filter(
    (n) => n.user.id !== state.user.id && n.need?.game === state.need.game
  );
  return normalizeCandidates(list.map((n) => ({ ...n.user, need: n.need })));
}

function roomShapeChanged(next, prev) {
  if (!next || !prev) return true;
  if (next.code !== prev.code || next.status !== prev.status) return true;
  if (JSON.stringify(next.need || {}) !== JSON.stringify(prev.need || {})) return true;
  const members = (next.members || []).map((m) => m.id + ":" + (m.memberStatus || "active") + ":" + (m.exitedAt || "")).join("|");
  const oldMembers = (prev.members || []).map((m) => m.id + ":" + (m.memberStatus || "active") + ":" + (m.exitedAt || "")).join("|");
  return members !== oldMembers;
}

function applyServerSnapshot(data) {
  const routeName = parseRoute().name;
  const patch = {
    match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool, playing: data.playing ?? state.match.playing },
    matchRequestId: data.matchRequestId || null,
  };
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
  if (data.session) {
    const session = data.session;
    if (!state.session || state.session.roomCode !== session.roomCode) {
      update(patch);
      handleServerGameOver(session);
      return;
    }
    const partnerId = (session.players || []).find((p) => p !== state.user.id);
    const mine = state.session.mine;
    const theirs = partnerId && session.rematchBy?.[partnerId] ? (session.rematchBy[partnerId] === "yes" ? "yes" : "no") : null;
    const connected = partnerId && session.rematchBy?.[partnerId] === "yes" && mine === "yes";
    if (theirs !== null || connected) {
      patch.session = { ...state.session, theirs, connected: connected || state.session.connected };
    }
  }
  if (Array.isArray(data.applications) && data.applications.length && !state.incomingRequest) {
    patch.incomingRequest = { application: data.applications[0] };
  }
  const candidates = snapshotCandidates(data);
  if (candidates !== null) {
    patch.match = {
      ...patch.match,
      candidates,
      status: candidates.length ? "matched" : "active",
    };
  }
  const roomChanged = patch.room ? roomShapeChanged(patch.room, state.room) : false;
  update(patch);
  if (routeName === "home") {
    const onlineEl = document.getElementById("home-online-count");
    const playingEl = document.getElementById("home-playing-count");
    if (onlineEl) onlineEl.textContent = String(Math.max(0, state.match.pool ?? 0));
    if (playingEl) playingEl.textContent = String(Math.max(0, state.match.playing ?? 0));
  }
  if (patch.room && routeName !== "room") {
    navigate("#/room");
  } else if (patch.room === null && routeName === "room") {
    render();
  } else if (patch.room && routeName === "room" && roomChanged) {
    render();
  }
  if (routeName === "matching" && (patch.match?.candidates || []).length) navigate("#/results");
  if (patch.session) render();
}

function handleIncomingApplication(application) {
  update({ incomingRequest: { application } });
  showApplicationSheet();
}

function showApplicationSheet() {
  const application = state.incomingRequest?.application;
  if (!application) return;
  const from = application.from || {};
  const need = from.need || state.need;
  closeSheet();
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="新的组队申请">
      <div class="sheet-head">
        <h2 class="sheet-title">有人想和你一起玩</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <div class="profile-identity" style="margin-bottom:14px">
        ${avatarWrap(from.avatarKey, 64, from.online)}
        <div>
          <div class="profile-name"><strong>${esc(from.nickname || "玩家")}</strong></div>
          <div class="profile-handle">${esc(from.device || "PC")} · 真人玩家</div>
        </div>
      </div>
      ${needSummary(need, { compact: true })}
      <div class="form-actions" style="margin-top:16px">
        ${button({ label: "接受一起玩", action: "accept-application", value: application.id, kind: "primary", iconName: "check" })}
        ${button({ label: "先拒绝", action: "decline-application", value: application.id, kind: "danger", iconName: "x" })}
      </div>
    </div>
  `);
}

function handleServerRoom(room) {
  const normalized = normalizeServerRoom(room);
  if (!state.room || state.room.code !== normalized.code) roomExitReadyAt = 0;
  update({
    room: normalized,
    need: room.need || state.need,
    session: null,
    incomingRequest: null,
    match: {
      ...state.match,
      pending: state.match.pending || normalized.partner?.id || null,
    },
  });
  navigate("#/room");
}

function handleServerGameOver(session) {
  if (state.session && state.session.roomCode === session.roomCode) return;
  const partner = state.room?.partner || state.session?.partner || {};
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const gameName = GAME_BY_ID[session.need?.game]?.name || session.need?.game || state.need.game || "游戏";
  const mode = session.need?.mode || state.need.mode || "";
  const historyEntry = {
    id: `s-${session.roomCode}-${Date.now()}`,
    title: `${gameName}${mode ? ` · ${mode}` : ""}`,
    partnerName: partner.name || partner.nickname || "玩家",
    time: `${now.getMonth() + 1}月${now.getDate()}日 ${time}`,
    result: "已完成",
  };
  update({
    room: null,
    lastRoomCode: session.roomCode,
    session: {
      partner: { ...partner },
      roomCode: session.roomCode,
      title: `${gameName}${mode ? ` · ${mode}` : ""}`,
      time,
      outcome: null,
      mine: null,
      theirs: null,
      connected: false,
    },
    stats: {
      ...state.stats,
      sessions: state.stats.sessions + 1,
      hours: state.stats.hours + 1,
    },
    history: [historyEntry, ...state.history].slice(0, 20),
  });
  navigate("#/gameover");
}

function handleServerConnected(friends) {
  const mapped = (friends || []).map((f) => ({
    id: f.id,
    name: f.nickname || f.name,
    avatarKey: f.avatarKey,
    online: f.online !== false,
    lastGame: state.session?.title || f.lastGame || "",
    lastTime: state.session?.time || f.lastTime || "",
  }));
  const patch = { friends: mapped };
  if (state.session) patch.session = { ...state.session, connected: true, theirs: "yes" };
  update(patch);
  render();
  toast("双方都愿意，已连接为搭子");
}

function connectEvents() {
  if (!ONLINE || !state.token) return;
  if (eventSourceClose) eventSourceClose();
  eventSourceClose = api.openEvents(state.token, {
    hello: applyServerSnapshot,
    online: (data) => {
      const pool = data.matching ?? data.online ?? state.match.pool;
      const playing = data.playing ?? state.match.playing;
      update({ match: { ...state.match, pool, playing } });
      const routeName = parseRoute().name;
      if (routeName === "home") render();
      if (routeName === "matching") {
        const poolEl = document.getElementById("pool-count");
        if (poolEl) poolEl.textContent = String(Math.max(0, pool ?? 0));
      }
    },
    needs: (data) => {
      const patch = { match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool, playing: data.playing ?? state.match.playing } };
      const routeName = parseRoute().name;
      if (state.need && ["matching", "results"].includes(routeName)) {
        const list = (data.needs || []).filter(
          (n) => n.user.id !== state.user.id && n.need?.game === state.need.game
        );
        patch.match.candidates = normalizeCandidates(list.map((n) => ({ ...n.user, need: n.need })));
        if (list.length) patch.match.status = "matched";
        else patch.match.candidates = [];
      }
      update(patch);
      if (routeName === "matching") {
        if ((patch.match.candidates || []).length) {
          navigate("#/results");
        } else {
          const poolEl = document.getElementById("pool-count");
          if (poolEl) poolEl.textContent = String(Math.max(0, patch.match.pool ?? 0));
          const foundEl = document.getElementById("match-found");
          if (foundEl) foundEl.textContent = "0";
        }
      }
    },
    friends: (data) => {
      update({ friends: mapServerFriends(data.friends || []) });
      if (parseRoute().name === "friends") render();
    },
    application: (data) => handleIncomingApplication(data.application),
    room: (data) => handleServerRoom(data.room),
    "game-over": (data) => handleServerGameOver(data.session),
    connected: (data) => handleServerConnected(data.friends || []),
    "rematch-result": () => {
      if (state.session) update({ session: { ...state.session, theirs: "no", connected: false } });
      render();
      toast("对方选择不再继续");
    },
    declined: () => {
      update({ match: { ...state.match, pending: null } });
      render();
      toast("对方暂不接受");
    },
  });
}

function renderAuthMode() {
  const isLogin = state.authMode !== "register";
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const active = tab.dataset.value === (isLogin ? "login" : "register");
    tab.classList.toggle("auth-tab--active", active);
  });
  const card = document.querySelector(".auth-card");
  if (!card) return;
  const title = card.querySelector(".card-title");
  if (title) title.textContent = isLogin ? "欢迎回来" : "创建账号";
  const sub = card.querySelector(".page-sub");
  if (sub) sub.textContent = isLogin ? "登录后继续你的游戏身份和匹配。" : "用用户名注册，匹配到的每一步都是真人玩家。";
  const submitLabel = card.querySelector('[data-action="auth-submit"] span');
  if (submitLabel) submitLabel.textContent = isLogin ? "登录" : "注册";
  const switchWrap = card.querySelector(".auth-switch");
  const switchLink = card.querySelector(".auth-switch-link");
  if (switchWrap) switchWrap.childNodes[0].textContent = isLogin ? "没有账号？" : "已有账号？";
  if (switchLink) {
    switchLink.textContent = isLogin ? "去注册" : "去登录";
    switchLink.dataset.value = isLogin ? "register" : "login";
  }
  const pw = card.querySelector('[name="password"]');
  if (pw) {
    pw.placeholder = isLogin ? "输入密码" : "至少 6 位";
    pw.autocomplete = isLogin ? "current-password" : "new-password";
  }
  card.querySelector("[data-auth-error]")?.remove();
  card.querySelector("[data-auth-note]")?.remove();
}

function showAuthError(message) {
  update({ authError: message });
  const form = document.querySelector('[data-form="auth"]');
  const card = form?.closest(".auth-card") || document.querySelector(".auth-card");
  let errorEl = card?.querySelector("[data-auth-error]");
  if (!errorEl && card) {
    errorEl = document.createElement("div");
    errorEl.className = "auth-error";
    errorEl.dataset.authError = "";
    const actions = card.querySelector(".form-actions");
    if (actions) actions.insertAdjacentElement("beforebegin", errorEl);
    else card.appendChild(errorEl);
  }
  if (errorEl) errorEl.textContent = message;
  const pw = form?.querySelector('[name="password"]');
  if (pw) pw.value = "";
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
      if (label) label.textContent = `${remain}s 后可以退出`;
    } else {
      btn.disabled = false;
      if (label) label.textContent = "退出游戏";
    }
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  timers.push(timer);
}

async function initRoomChat() {
  const room = state.room;
  if (!room?.id || !state.token) return;
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
  if (!DRAFT.nickname.trim() || !DRAFT.genres.length) {
    toast("昵称和常玩游戏类型至少选一项");
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
      token: result.token,
      match: { ...state.match, pool: 0 },
    });
    DRAFT.dirty = false;
    connectEvents();
    navigate("#/home");
    toast(`欢迎，${result.user.nickname}`);
  } catch (err) {
    toast(err.message);
  }
}

async function startMatch() {
  syncDraftFromDom("need");
  DRAFT.dirty = false;
  const tags = DRAFT.selectedTags || [];
  const styleParts = [DRAFT.style, ...tags].filter(Boolean);
  const playerType = styleParts.length ? styleParts.join(" / ") : "不限";
  const target = Math.min(8, Math.max(2, Number(DRAFT.current || 1) + Number(DRAFT.needed || 1)));
  const need = {
    game: DRAFT.game,
    mode: DRAFT.mode,
    goal: DRAFT.goal,
    current: Math.min(Number(DRAFT.current || 1), target - 1),
    target,
    time: DRAFT.time || "现在就玩",
    duration: DRAFT.duration || "60",
    voice: DRAFT.voice !== false,
    playerType,
    details: {
      modpack: DRAFT.modpack || "",
      activityType: DRAFT.mode || "",
      playStyle: DRAFT.style || "",
      rank: DRAFT.rank || "",
      hero: DRAFT.hero || "",
      role: DRAFT.role || "",
      gameMode: DRAFT.mode || "",
      tags,
      voicePreference: DRAFT.voicePref || "都可以",
    },
  };
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  update({
    need,
    match: {
      status: "active",
      pool: state.match.pool ?? 0,
      playing: state.match.playing ?? 0,
      candidates: [],
      pending: null,
    },
  });
  try {
    const data = await api.postNeed(state.token, need);
    const candidates = normalizeCandidates(data.candidates || []);
    update({
      match: {
        ...state.match,
        status: candidates.length ? "matched" : "active",
        pool: data.matching ?? data.online ?? state.match.pool,
        playing: data.playing ?? state.match.playing,
        matchRequestId: data.requestId || null,
        candidates,
      },
    });
    navigate(candidates.length ? "#/results" : "#/matching");
  } catch (err) {
    toast(err.message);
  }
}

function startMatchingFlow() {
  const started = Date.now();
  const interval = window.setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const poolEl = document.getElementById("pool-count");
    const timeEl = document.getElementById("match-time");
    const foundEl = document.getElementById("match-found");
    const titleEl = document.getElementById("match-title");
    if (poolEl) poolEl.textContent = String(Math.max(0, state.match.pool ?? 0));
    if (timeEl) timeEl.textContent = `${Math.floor(elapsed)}s`;
    if (foundEl) foundEl.textContent = String((state.match.candidates || []).length);
    if (titleEl) titleEl.textContent = elapsed > 3 ? "正在锁定候选节点" : "正在筛选节点";
    const steps = document.querySelectorAll(".match-step");
    if (steps.length === 3) {
      steps[1].classList.toggle("match-step--active", elapsed < 3);
      steps[1].classList.toggle("match-step--done", elapsed >= 3);
      steps[2].classList.toggle("match-step--active", elapsed >= 3);
    }
  }, 350);
  timers.push(interval);
}

async function applyPartner(id) {
  const candidate = findCandidate(id);
  if (!candidate) return;
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await api.applyTo(state.token, candidate.id);
    update({ match: { ...state.match, pending: id } });
    render();
    toast("邀请已发送，等对方也邀请你");
  } catch (err) {
    toast(err.message);
  }
}

async function startGame() {
  if (!state.room?.code || !ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await api.roomAction(state.room.code, "start", state.token);
    update({ room: { ...state.room, status: "playing", startedAt: Date.now() } });
    render();
  } catch (err) {
    toast(err.message);
  }
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

async function finishGame() {
  const partner = state.room?.partner;
  if (!partner) return;
  if (!state.room?.code || !ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await api.roomAction(state.room.code, "finish", state.token);
  } catch (err) {
    toast(err.message);
    return;
  }
  await new Promise((resolve) => window.setTimeout(resolve, 800));
  if (state.session) return;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const title = `${GAME_BY_ID[state.need.game]?.name || state.need.game} · ${state.need.mode}`;
  const historyEntry = {
    id: `f-${state.room?.code}-${Date.now()}`,
    title,
    partnerName: partner.name || "玩家",
    time: `${now.getMonth() + 1}月${now.getDate()}日 ${time}`,
    result: "已完成",
  };
  update({
    room: null,
    lastRoomCode: state.room?.code,
    session: {
      partner: { ...partner },
      roomCode: state.room?.code,
      title,
      time,
      outcome: null,
      mine: null,
      theirs: null,
      connected: false,
    },
    stats: {
      ...state.stats,
      sessions: state.stats.sessions + 1,
      hours: state.stats.hours + 1,
    },
  });
  navigate("#/gameover");
}

function exitRoomPrompt() {
  const partner = state.room?.partner;
  if (!partner) return;
  closeSheet();
  showSheet(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="退出游戏">
      <div class="sheet-head">
        <h2 class="sheet-title">确定结束这次游戏？</h2>
        <button class="sheet-close" data-action="close-sheet" aria-label="关闭">${icon("x", 18)}</button>
      </div>
      <div class="profile-identity" style="margin-bottom:14px">
        ${avatarWrap(partner.avatarKey, 56, partner.online)}
        <div>
          <div class="profile-name"><strong>${esc(partner.name || "玩家")}</strong></div>
          <div class="profile-handle">${esc(partner.device || "PC")} · 本次连接会保留在最近连接里</div>
        </div>
      </div>
      <div class="form-actions">
        ${button({ label: "取消", action: "close-sheet", kind: "ghost" })}
        ${button({ label: "退出", action: "confirm-exit-room", kind: "danger", iconName: "logOut" })}
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
    await api.roomAction(room.code, "exit", state.token);
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
    navigate("#/gameover");
    toast("已退出，本次连接已记录");
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
    const data = await api.updateProfile(state.token, { gameAccounts: next });
    update({ user: { ...state.user, ...data.user } });
    render();
    toast("游戏账号已保存");
  } catch (err) {
    toast(err.message);
  }
}

async function setRoomRating(rating) {
  const code = state.session?.roomCode || state.lastRoomCode;
  if (!code || !ONLINE) return;
  try {
    await api.roomFeedback(code, { rating }, state.token);
    update({ session: { ...state.session, rating } });
    render();
  } catch (err) {
    toast(err.message);
  }
}

async function setRoomWantAgain(wantAgain) {
  const code = state.session?.roomCode || state.lastRoomCode;
  if (!code || !ONLINE) return;
  try {
    await api.roomFeedback(code, { wantAgain }, state.token);
    update({ session: { ...state.session, wantAgain } });
    render();
    if (wantAgain) toast("已记录，下次可以再来找 TA");
  } catch (err) {
    toast(err.message);
  }
}

async function rematchRecent(id) {
  const item = state.recentConnections.find((c) => c.id === id);
  if (!item) return;
  const game = GAMES.find((g) => g.id === item.gameId) || GAMES[0];
  const need = { ...state.need, game: game.id, mode: game.modes[0], goal: "" };
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  update({
    need,
    match: { status: "active", pool: state.match.pool ?? 0, playing: state.match.playing ?? 0, candidates: [], pending: null },
  });
  try {
    const data = await api.postNeed(state.token, need);
    update({
      match: {
        ...state.match,
        status: "active",
        pool: data.matching ?? data.online ?? state.match.pool,
        playing: data.playing ?? state.match.playing,
        matchRequestId: data.requestId || null,
        candidates: normalizeCandidates(data.candidates || []),
      },
    });
  } catch (err) {
    toast(err.message);
  }
  navigate("#/matching");
}

function setOutcome(outcome) {
  if (!state.session) return;
  update({ session: { ...state.session, outcome } });
  render();
}

async function chooseRematch(value) {
  if (!state.session || state.session.mine) return;
  update({ session: { ...state.session, mine: value } });
  render();
  const roomCode = state.session.roomCode || state.lastRoomCode;
  if (!roomCode || !ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  try {
    await api.rematch(roomCode, value, state.token);
  } catch (err) {
    toast(err.message);
  }
}

async function rematchFriend(id) {
  const friend = state.friends.find((f) => f.id === id);
  if (!friend) return;
  const game = GAMES.find((g) => (friend.lastGame || "").includes(g.name)) || GAMES[0];
  const need = {
    ...state.need,
    game: game.id,
    mode: game.modes[0],
  };
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  update({
    need: {
      ...need,
    },
    match: {
      status: "active",
      pool: state.match.pool ?? 0,
      playing: state.match.playing ?? 0,
      candidates: [],
      pending: null,
    },
  });
  try {
    const data = await api.postNeed(state.token, need);
    update({
      match: {
        ...state.match,
        status: "active",
        pool: data.matching ?? data.online ?? state.match.pool,
        playing: data.playing ?? state.match.playing,
        matchRequestId: data.requestId || null,
        candidates: normalizeCandidates(data.candidates || []),
      },
    });
  } catch (err) {
    toast(err.message);
  }
  navigate("#/matching");
}

async function rematchNow() {
  if (!ONLINE) {
    toast("服务暂不可用，请稍后重试");
    return;
  }
  update({
    match: { ...state.match, status: "active", candidates: [], pending: null, pool: state.match.pool ?? 0 },
  });
  try {
    const data = await api.postNeed(state.token, state.need);
    update({
      match: {
        ...state.match,
        status: "active",
        pool: data.matching ?? data.online ?? state.match.pool,
        playing: data.playing ?? state.match.playing,
        matchRequestId: data.requestId || null,
        candidates: normalizeCandidates(data.candidates || []),
      },
    });
  } catch (err) {
    toast(err.message);
  }
  navigate("#/matching");
}

function cancelMatch() {
  clearTimers();
  if (ONLINE) api.cancelNeed(state.token).catch(() => {});
  update({ match: { ...state.match, status: "idle", candidates: [] } });
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
            ${[1, 2, 3, 4]
              .map(
                (i) =>
                  `<button type="button" class="${user.avatarKey === `me-${i}` ? "button--on" : ""}" data-action="pick-avatar" data-value="me-${i}" aria-label="头像 ${i}">${avatar(
                    `me-${i}`,
                    96
                  )}</button>`
              )
              .join("")}
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
    const data = await api.updateProfile(state.token, {
      nickname,
      device,
      gender,
      playStyle,
      avatarKey: DRAFT.avatarKey,
      genres,
      voice: state.user.voice,
    });
    update({ user: { ...state.user, ...data.user } });
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

async function logout() {
  if (ONLINE && state.token) { api.cancelNeed(state.token).catch(() => {}); api.goOffline(state.token); }
  if (eventSourceClose) {
    eventSourceClose();
    eventSourceClose = null;
  }
  await api.signOut().catch(() => {});
  resetState();
  DRAFT.dirty = false;
  navigate("#/auth");
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
    toast("在线版才支持按代码搜索");
    return;
  }
  try {
    const data = await api.searchFriend(state.token, code);
    update({ friendSearchResult: data.user });
    render();
  } catch (err) {
    toast(err.message);
  }
}

async function addFriendByCodeAction(code) {
  if (!ONLINE) {
    toast("在线版才支持添加好友");
    return;
  }
  try {
    const data = await api.addFriendByCode(state.token, code);
    update({
      friends: mapServerFriends(data.friends),
      friendSearchResult: null,
    });
    render();
    toast(`已添加 ${data.user.nickname}`);
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
      await api.sendFeedback(state.token, {
        category: fd.get("category") || "bug",
        message,
        contact: String(fd.get("contact") || "").trim(),
        requestId,
        currentPage: location.hash || "/",
        currentGame: state.need?.game || state.user?.games?.[0]?.gameId || null,
        currentMatchRequestId: state.matchRequestId || null,
      });
      closeSheet();
      toast("反馈已收到，感谢你的反馈。");
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
    const scope = actionEl.closest("[data-avatar-pick]");
    scope?.querySelectorAll("button").forEach((b) => b.classList.remove("button--on"));
    actionEl.classList.add("button--on");
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

  if (action === "toggle-genre") {
    const selected = new Set(DRAFT.genres || []);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    DRAFT.genres = [...selected];
    actionEl.classList.toggle("chip--on");
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

  if (action === "toggle-home-filter") {
    const overlay = document.querySelector("[data-home-filter]");
    if (!overlay) return;
    showHomeFilter(overlay.hidden);
    return;
  }

  if (action === "close-home-filter") {
    showHomeFilter(false);
    return;
  }

  if (action === "home-game") {
    HOME_FILTER.game = value;
    const game = GAMES.find((g) => g.id === value);
    HOME_FILTER.mode = game?.modes?.[0] || "";
    HOME_FILTER.time = homeFilterCompetitive(value) ? HOME_RANK_TIMES[0] : HOME_CASUAL_TIMES[0];
    renderHomeFilterGameState();
    renderHomeFilterTags();
    return;
  }

  if (action === "home-mode") {
    HOME_FILTER.mode = value;
    const group = actionEl.closest(".home-filter-tag-group");
    group?.querySelectorAll(".home-filter-tag").forEach((c) => c.classList.remove("is-on"));
    actionEl.classList.add("is-on");
    return;
  }

  if (action === "home-time") {
    HOME_FILTER.time = value;
    const group = actionEl.closest(".home-filter-tag-group");
    group?.querySelectorAll(".home-filter-tag").forEach((c) => c.classList.remove("is-on"));
    actionEl.classList.add("is-on");
    return;
  }

  if (action === "home-team") {
    HOME_FILTER.team = value;
    const group = actionEl.closest(".home-filter-tag-group");
    group?.querySelectorAll(".home-filter-tag").forEach((c) => c.classList.remove("is-on"));
    actionEl.classList.add("is-on");
    return;
  }

  if (action === "home-voice") {
    HOME_FILTER.voice = value;
    const group = actionEl.closest(".home-filter-tag-group");
    group?.querySelectorAll(".home-filter-tag").forEach((c) => c.classList.remove("is-on"));
    actionEl.classList.add("is-on");
    return;
  }

  if (action === "home-filter-open-voice") {
    HOME_FILTER.step = 5;
    renderHomeFilterStep();
    return;
  }

  if (action === "home-filter-back") {
    HOME_FILTER.step = Math.max(1, Number(HOME_FILTER.step) - 1);
    renderHomeFilterStep();
    return;
  }

  if (action === "home-filter-next") {
    if (Number(HOME_FILTER.step) >= 6) {
      startHomeFilter();
      return;
    }
    HOME_FILTER.step = Number(HOME_FILTER.step) + 1;
    renderHomeFilterStep();
    return;
  }

  const actions = {
    "go-home": () => navigate("#/home"),
    "go-me": () => navigate("#/me"),
    "go-friends": () => navigate("#/friends"),
    "go-need": () => {
      prepareNeedDraft();
      navigate("#/need");
    },
    "switch-auth-mode": (value) => {
      update({ authMode: value === "register" ? "register" : "login", authError: "", authNotice: "" });
      renderAuthMode();
    },
    "toggle-password": () => {
      const input = document.querySelector("#auth-password");
      const toggle = document.querySelector("[data-action='toggle-password']");
      if (!input || !toggle) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.classList.toggle("is-show", show);
      toggle.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
    },
    "auth-submit": () => submitAuth(),
    "complete-onboard": completeOnboard,
    "start-match": startMatch,
    "cancel-match": cancelMatch,
    "rematch": rematchNow,
    "quick-need": (id) => {
      const game = GAMES.find((g) => g.id === id);
      if (!game) return;
      DRAFT.game = game.id;
      DRAFT.mode = game.modes[0];
      DRAFT.dirty = false;
      update({ need: { ...state.need, game: game.id, mode: game.modes[0] } });
      navigate("#/need");
    },
    "view-profile": (id) => navigate(`#/player/${id}`),
    "apply-partner": (id) => applyPartner(id),
    "open-room": () => navigate("#/room"),
    "leave-room": exitRoomPrompt,
    "exit-room": exitRoomPrompt,
    "confirm-exit-room": confirmExitRoom,
    "save-room-account": saveRoomGameAccount,
    "copy-room-account": (value) => copyText(value),
    "add-game-friend": (value) => {
      copyText(value);
      toast("已复制，请去游戏内添加好友");
    },
    "set-room-rating": (value) => setRoomRating(value),
    "set-room-want": (value) => setRoomWantAgain(value === "yes"),
    "rematch-recent": (id) => rematchRecent(id),
    "back-to-match": () => navigate("#/need"),
    "go-recent": () => navigate("#/connections"),
    "start-game": startGame,
    "finish-game": finishGame,
    "set-outcome": (outcome) => setOutcome(outcome),
    "choose-rematch": (choice) => chooseRematch(choice),
    "rematch-friend": (id) => rematchFriend(id),
    "open-profile-edit": openProfileEdit,
    "close-sheet": closeSheet,
    "save-profile": saveProfile,
    "logout": logout,
    "search-friend": searchFriendByCode,
    "add-friend-by-code": (code) => addFriendByCodeAction(code),
    "copy-code": (code) => copyText(code),
    "open-feedback": openFeedback,
    "submit-feedback": submitFeedback,
    "accept-application": async (id) => {
      try {
        const result = await api.acceptApplication(state.token, id);
        closeSheet();
        update({ incomingRequest: null });
        if (result.room) {
          update({
            room: normalizeServerRoom(result.room),
            need: result.room.need || state.need,
            session: null,
          });
          navigate("#/room");
        }
      } catch (err) {
        toast(err.message);
      }
    },
    "decline-application": async (id) => {
      try {
        await api.declineApplication(state.token, id);
        closeSheet();
        update({ incomingRequest: null });
      } catch (err) {
        toast(err.message);
      }
    },
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
      const scope = target.closest("[data-avatar-pick]");
      scope?.querySelectorAll("button").forEach((b) => b.classList.remove("button--on"));
      const tile = scope?.querySelector('[data-action="choose-avatar-file"]');
      tile?.classList.add("button--on");
      const preview = tile?.querySelector("[data-avatar-preview]");
      if (preview) preview.innerHTML = avatar(dataUrl, 72);
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
  if (ONLINE && state.token) api.goOffline(state.token);
});

async function detectOnline() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
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
  const status = await api.sessionStatus(session.access_token);
  update({
    authenticated: true,
    token: session.access_token,
    authUsername: String(session.user?.user_metadata?.username || ""),
    onboarded: !!status.profile,
    authError: "",
    authNotice: "",
  });
  if (status.profile) {
    update({ user: status.profile });
    try {
      const snapshot = await api.getState(session.access_token);
      update({ user: snapshot.user });
      applyServerSnapshot(snapshot);
    } catch {
      // profile-only state is enough to enter home
    }
    connectEvents();
    navigate("#/home");
    toast(`欢迎回来，${state.user.nickname}`);
  } else {
    update({ user: { ...state.user, nickname: "", avatarKey: "me-1", device: "PC", gender: "保密", games: [], genres: [], playStyle: "" } });
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
    const status = await api.sessionStatus(session.access_token);
    if (!status.authenticated) {
      await api.signOut().catch(() => {});
      resetState();
      return;
    }
    update({
      authenticated: true,
      token: session.access_token,
      authUsername: String(session.user?.user_metadata?.username || ""),
      onboarded: !!status.profile,
      authError: "",
      authNotice: "",
    });
    if (status.profile) {
      update({ user: status.profile });
      try {
        const snapshot = await api.getState(session.access_token);
        update({ user: snapshot.user });
        applyServerSnapshot(snapshot);
      } catch {
        // keep profile-only state
      }
    } else {
      update({ user: { ...state.user, nickname: "", avatarKey: "me-1", device: "PC", gender: "保密", games: [], genres: [], playStyle: "" } });
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
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中…";
  }
  update({ authError: "", authNotice: "" });
  document.querySelector("[data-auth-error]")?.remove();
  try {
    const data = state.authMode === "register"
      ? await api.registerAccount(username, password)
      : await api.loginByUsername(username, password);
    await api.signIn(data.email, password);
    await handleAuthSuccess();
  } catch (err) {
    showAuthError(mapAuthError(err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = state.authMode === "register" ? "注册" : "登录";
    }
  }
}

render();
ONLINE = await detectOnline();
await restoreSession();
if (ONLINE && state.authenticated && state.onboarded && state.token) connectEvents();
render();
