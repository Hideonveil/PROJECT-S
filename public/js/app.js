import { icon } from "./icons.js";
import { avatar, avatarWrap, paintAvatars } from "./avatar.js";
import { initNodeField } from "./field.js";
import { button, esc, needSummary, shell, toast } from "./ui.js";
import { state, update, resetState } from "./store.js";
import { DEVICES, GAME_BY_ID, GAMES } from "./data.js";
import * as api from "./api.js";
import { authPage } from "./pages/auth.js";
import { welcomePage } from "./pages/welcome.js";
import { homePage } from "./pages/home.js";
import { needPage } from "./pages/need.js";
import { matchingPage } from "./pages/matching.js";
import { resultsPage } from "./pages/results.js";
import { profilePage } from "./pages/profile.js";
import { roomPage } from "./pages/room.js";
import { gameoverPage } from "./pages/gameover.js";
import { friendsPage } from "./pages/friends.js";
import { mePage } from "./pages/me.js";

const app = document.getElementById("app");

const DRAFT = {
  nickname: state.user.nickname,
  avatarKey: state.user.avatarKey,
  device: state.user.device,
  gender: state.user.gender || "保密",
  games: (state.user.games || []).map((g) => g.gameId),
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
  dirty: false,
};

let activeField = null;
let timers = [];
let ONLINE = false;
let eventSourceClose = null;

function clearTimers() {
  timers.forEach((t) => {
    window.clearTimeout(t);
    window.clearInterval(t);
  });
  timers = [];
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
  destroyField();
  const route = parseRoute();
  if (route.name !== "need" && route.name !== "welcome") DRAFT.dirty = false;

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
  if (route.name === "room" && state.room?.status === "connecting") {
    timers.push(
      window.setTimeout(() => {
        update({ room: { ...state.room, status: "ready" } });
        render();
      }, 1500)
    );
  }
  if (route.name === "room" && state.room?.status === "playing") startRoomTimer();
}

function prepareOnboardDraft() {
  DRAFT.nickname = state.user.nickname || state.authUsername || "";
  DRAFT.avatarKey = state.user.avatarKey || "me-1";
  DRAFT.device = state.user.device || "PC";
  DRAFT.gender = state.user.gender || "保密";
  DRAFT.games = (state.user.games || []).map((g) => g.gameId);
  DRAFT.playStyle = state.user.playStyle || "";
}

function prepareNeedDraft() {
  DRAFT.game = state.need.game;
  DRAFT.mode = state.need.mode;
  DRAFT.goal = state.need.goal;
  DRAFT.current = state.need.current;
  DRAFT.target = state.need.target;
  DRAFT.time = state.need.time;
  DRAFT.duration = state.need.duration;
  DRAFT.voice = state.need.voice;
  DRAFT.playerType = state.need.playerType;
  DRAFT.dirty = false;
}

function findCandidate(id) {
  return state.match.candidates?.find((c) => c.id === id) || null;
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
  const players = room.players || [];
  const other = players.find((p) => p.id !== state.user.id) || players[0] || {};
  const partner = {
    ...other,
    name: other.nickname || other.name || "玩家",
    handle: other.handle || `${other.nickname || "玩家"}#${String(other.id || "").slice(-4)}`,
    kind: "player",
    games: other.games || [],
    need: other.need || room.need || state.need,
  };
  return {
    code: room.code,
    partner,
    status: room.status || "ready",
    startedAt: room.startedAt || 0,
    target: room.need?.target || state.need.target || 5,
  };
}

function applyServerSnapshot(data) {
  const patch = {
    match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool },
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
    const room = normalizeServerRoom(data.room);
    if (!state.room || state.room.code !== room.code) patch.room = room;
    else if (state.room.code === room.code && (state.room.status !== room.status || state.room.startedAt !== room.startedAt)) {
      patch.room = room;
    }
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
  update(patch);
  if (patch.room && parseRoute().name !== "room") navigate("#/room");
  if ((patch.room && parseRoute().name === "room") || patch.session) render();
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
        ${button({ label: "接受并开房", action: "accept-application", value: application.id, kind: "primary", iconName: "check" })}
        ${button({ label: "先拒绝", action: "decline-application", value: application.id, kind: "danger", iconName: "x" })}
      </div>
    </div>
  `);
}

function handleServerRoom(room) {
  update({
    room: normalizeServerRoom(room),
    need: room.need || state.need,
    session: null,
    incomingRequest: null,
    match: {
      ...state.match,
      pending: state.match.pending || room.players?.find((p) => p.id !== state.user.id)?.id || null,
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
      update({ match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool } });
      if (parseRoute().name === "home") render();
    },
    needs: (data) => {
      const patch = { match: { ...state.match, pool: data.matching ?? data.online ?? state.match.pool } };
      const routeName = parseRoute().name;
      if (state.need && ["matching", "results"].includes(routeName)) {
        const list = (data.needs || []).filter(
          (n) =>
            n.user.id !== state.user.id &&
            n.need?.game === state.need.game &&
            n.need?.mode === state.need.mode
        );
        if (list.length) {
          patch.match.candidates = normalizeCandidates(list.map((n) => ({ ...n.user, need: n.need })));
        }
      }
      update(patch);
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

async function completeOnboard() {
  syncDraftFromDom("onboard");
  if (!DRAFT.nickname.trim() || !DRAFT.games.length) {
    toast("昵称和常玩游戏至少填一项");
    return;
  }
  const user = {
    ...state.user,
    nickname: DRAFT.nickname,
    avatarKey: DRAFT.avatarKey,
    device: DRAFT.device,
    gender: DRAFT.gender || "保密",
    playStyle: DRAFT.playStyle,
    games: DRAFT.games.map((gameId) => {
      const existing = state.user.games.find((g) => g.gameId === gameId);
      const game = GAME_BY_ID[gameId];
      return (
        existing || {
          gameId,
          role: game?.roles?.[0] || "输出",
          level: 60,
          winRate: "50%",
          note: DRAFT.playStyle,
        }
      );
    }),
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
      games: user.games,
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
  const need = {
    game: DRAFT.game,
    mode: DRAFT.mode,
    goal: DRAFT.goal,
    current: Math.min(DRAFT.current, DRAFT.target - 1),
    target: DRAFT.target,
    time: DRAFT.time,
    duration: DRAFT.duration,
    voice: DRAFT.voice,
    playerType: DRAFT.playerType,
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
        matchRequestId: data.requestId || null,
        candidates: normalizeCandidates(data.candidates || []),
      },
    });
    navigate("#/matching");
  } catch (err) {
    toast(err.message);
  }
}

function startMatchingFlow() {
  const started = Date.now();
  const basePool = Math.max(0, state.match.pool ?? 0);
  const interval = window.setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    const poolEl = document.getElementById("pool-count");
    const timeEl = document.getElementById("match-time");
    const foundEl = document.getElementById("match-found");
    const titleEl = document.getElementById("match-title");
    if (poolEl) {
      poolEl.textContent = String(basePool);
    }
    if (timeEl) timeEl.textContent = `${Math.floor(elapsed)}s`;
    if (foundEl) foundEl.textContent = Math.min(3, Math.floor(elapsed / 1.25));
    if (titleEl) {
      titleEl.textContent = elapsed > 3 ? "正在锁定候选节点" : "正在筛选节点";
    }
    const steps = document.querySelectorAll(".match-step");
    if (steps.length === 3) {
      steps[1].classList.toggle("match-step--active", elapsed < 3);
      steps[1].classList.toggle("match-step--done", elapsed >= 3);
      steps[2].classList.toggle("match-step--active", elapsed >= 3);
    }
  }, 350);
  timers.push(interval);

  timers.push(
    window.setTimeout(() => {
      clearTimers();
      update({
        match: {
          ...state.match,
          status: "matched",
          pool: state.match.pool ?? 0,
        },
      });
      if (!state.match.candidates.length) {
        navigate("#/home");
        toast("匹配池暂无合适真人，换个需求再试");
        return;
      }
      navigate("#/results");
    }, 4200)
  );
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
    toast("申请已发送，等待对方接受");
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
  DRAFT.games = (user.games || []).map((g) => g.gameId);
  const selected = (user.games || []).map((g) => g.gameId);
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
          <span class="label">常玩游戏</span>
          <div class="chip-group" data-chip-group="edit-games">
            ${GAMES.map((g) => `<button type="button" class="chip ${selected.includes(g.id) ? "chip--on" : ""}" data-action="toggle-game" data-value="${g.id}">${esc(g.name)}</button>`).join("")}
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
  const games = DRAFT.games.length
    ? DRAFT.games.map((gameId) => {
        const existing = state.user.games.find((g) => g.gameId === gameId);
        const game = GAME_BY_ID[gameId];
        return existing || { gameId, role: game?.roles?.[0] || "输出", level: 60, winRate: "50%", note: playStyle };
      })
    : state.user.games;
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
      games,
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

  if (action === "choose-avatar-file") {
    const scope = actionEl.closest("[data-avatar-pick]");
    const input = scope?.querySelector("input[data-avatar-file]");
    input?.click();
    return;
  }

  if (action === "toggle-game") {
    const group = actionEl.closest("[data-chip-group]");
    const isEdit = group?.dataset.chipGroup === "edit-games";
    if (isEdit) {
      const selected = new Set(DRAFT.games);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      DRAFT.games = [...selected];
      actionEl.classList.toggle("chip--on");
      return;
    }
    const selected = new Set(DRAFT.games);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    DRAFT.games = [...selected];
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

  const actions = {
    "go-home": () => navigate("#/home"),
    "go-friends": () => navigate("#/friends"),
    "go-need": () => {
      prepareNeedDraft();
      navigate("#/need");
    },
    "switch-auth-mode": (value) => {
      update({ authMode: value === "register" ? "register" : "login", authError: "", authNotice: "" });
      render();
    },
    "auth-submit": () => submitAuth(),
    "pick-gender": (value) => {
      DRAFT.gender = value;
      DRAFT.dirty = true;
      render();
    },
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
    "leave-room": () => {
      update({ room: null });
      navigate("#/home");
    },
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
        await api.acceptApplication(state.token, id);
        closeSheet();
        update({ incomingRequest: null });
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

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", () => {
  clearTimers();
  destroyField();
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
    update({ user: { ...state.user, nickname: "", avatarKey: "me-1", device: "PC", gender: "保密", games: [], playStyle: "" } });
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
      update({ user: { ...state.user, nickname: "", avatarKey: "me-1", device: "PC", gender: "保密", games: [], playStyle: "" } });
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
  if (!username || !password) {
    update({ authError: "请输入用户名和密码" });
    render();
    return;
  }
  if (/\s/.test(username)) {
    update({ authError: "用户名不能包含空格" });
    render();
    return;
  }
  if (username.length < 2 || username.length > 24) {
    update({ authError: "用户名需为 2-24 个字符" });
    render();
    return;
  }
  if (password.length < 6) {
    update({ authError: "密码至少 6 位" });
    render();
    return;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中…";
  }
  update({ authError: "", authNotice: "" });
  try {
    const data = state.authMode === "register"
      ? await api.registerAccount(username, password)
      : await api.loginByUsername(username, password);
    await api.signIn(data.email, password);
    await handleAuthSuccess();
  } catch (err) {
    update({ authError: mapAuthError(err) });
    render();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = state.authMode === "register" ? "注册" : "登录";
    }
  }
}

ONLINE = await detectOnline();
await restoreSession();
if (ONLINE && state.authenticated && state.onboarded && state.token) connectEvents();
render();
