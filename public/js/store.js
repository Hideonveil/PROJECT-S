import { DEFAULT_NEED } from "./data.js";

const KEY = "node-mvp-v1";

export function defaultState() {
  return {
    authenticated: false,
    authUsername: "",
    authMode: "login",
    authError: "",
    authNotice: "",
    onboarded: false,
    user: {
      id: "",
      nickname: "",
      handle: "",
      avatarKey: "",
      friendCode: "",
      device: "",
      gender: "",
      ageRange: "保密",
      games: [],
      genres: [],
      playStyle: "",
      voice: true,
      online: false,
      gameAccounts: {},
    },
    need: JSON.parse(JSON.stringify(DEFAULT_NEED)),
    match: {
      status: "idle",
      pool: 0,
      playing: 0,
      candidates: [],
      pending: null,
    },
    incomingRequest: null,
    matchRequestId: null,
    lastRoomCode: null,
    friendSearchResult: null,
    room: null,
    session: null,
    friends: [],
    recentConnections: [],
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

export function save() {
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
