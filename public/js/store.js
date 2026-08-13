import { CANDIDATES, DEFAULT_NEED, DEFAULT_USER } from "./data.js";

const KEY = "node-mvp-v1";
const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");

export function defaultState() {
  return {
    onboarded: false,
    user: JSON.parse(JSON.stringify(DEFAULT_USER)),
    need: JSON.parse(JSON.stringify(DEFAULT_NEED)),
    match: {
      status: "idle",
      pool: 0,
      candidates: [],
      pending: null,
    },
    incomingRequest: null,
    matchRequestId: null,
    token: null,
    lastRoomCode: null,
    friendSearchResult: null,
    room: null,
    session: null,
    friends: [],
    history: [],
    stats: {
      sessions: 0,
      connected: 0,
      hours: 0,
    },
  };
}

export let state = load();

function load() {
  if (new URLSearchParams(window.location.search).has("demo")) {
    return demoState();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      user: { ...defaultState().user, ...(parsed.user || {}) },
      need: { ...defaultState().need, ...(parsed.need || {}) },
      match: { ...defaultState().match, ...(parsed.match || {}) },
    };
  } catch {
    return defaultState();
  }
}

function demoState() {
  const d = defaultState();
  const candidate = JSON.parse(JSON.stringify(CANDIDATES[0]));
  d.onboarded = true;
  d.match = {
    status: "matched",
    pool: 242,
    candidates: JSON.parse(JSON.stringify(CANDIDATES)),
    pending: null,
  };
  d.room = {
    code: "N7-K9P",
    partner: candidate,
    status: "ready",
    startedAt: 0,
  };
  d.session = {
    partner: candidate,
    title: "无畏契约 · 排位赛",
    time: "22:40",
    outcome: "win",
    mine: "yes",
    theirs: "yes",
    connected: true,
  };
  d.friends = [
    {
      id: candidate.id,
      name: candidate.name,
      avatarKey: candidate.avatarKey,
      online: true,
      lastGame: "无畏契约 · 排位赛",
      lastTime: "今天 22:40",
    },
  ];
  d.history = [
    {
      id: Date.now(),
      title: "无畏契约 · 排位赛",
      partnerName: candidate.name,
      time: "今天 22:40",
      result: "胜利 · 已连接",
    },
  ];
  d.stats = { sessions: 1, connected: 1, hours: 1 };
  return d;
}

export function save() {
  if (DEMO_MODE) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage can be unavailable in strict privacy modes; the app still runs in memory
  }
}

export function update(patch) {
  state = { ...state, ...patch };
  save();
}

export function resetState() {
  state = defaultState();
  save();
}
