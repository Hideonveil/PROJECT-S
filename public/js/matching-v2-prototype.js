import { icon } from "./icons.js";
import { homePage } from "./pages/home.js";
import { matchingPage } from "./pages/matching.js";
import { sessionPage } from "./pages/session-preview.js";
import { homeShell } from "./ui.js";

const root = document.getElementById("matching-v2-prototype-root");

if (root) {
  const USERS = [
    { id: "prototype-self", nickname: "你", handle: "LOCAL MOCK", avatarKey: "", online: true, mode: "casual", microphonePreference: "on" },
    { id: "mira-chen", nickname: "Mira Chen", handle: "mirac", avatarKey: "", online: true, mode: "ranked", rankCode: "oracle", microphonePreference: "on" },
    { id: "小满", nickname: "小满", handle: "xiaoman", avatarKey: "", online: true, mode: "casual", microphonePreference: "off" },
    { id: "alexandria", nickname: "Alexandria 超长昵称测试", handle: "alexandria-long-name", avatarKey: "", online: true, mode: "casual", microphonePreference: "any" },
    { id: "河岸边", nickname: "河岸边", handle: "riverbank", avatarKey: "", online: true, mode: "casual", microphonePreference: "on" },
    { id: "noah-k", nickname: "Noah K.", handle: "noahk", avatarKey: "", online: true, mode: "ranked", rankCode: "phantom", microphonePreference: "on" },
    { id: "阿洛", nickname: "阿洛不迟到", handle: "alo", avatarKey: "", online: true, mode: "casual", microphonePreference: "off" },
    { id: "jinx", nickname: "Jinx_404", handle: "jinx404", avatarKey: "", online: true, mode: "ranked", rankCode: "ascendant", microphonePreference: "any" },
  ];

  const state = {
    authenticated: true,
    onboarded: true,
    user: { ...USERS[0] },
    need: {
      game: "deadlock",
      mode: "",
      goal: "",
      current: 1,
      target: 2,
      time: "现在",
      duration: "不限",
      voice: true,
      playerType: "不限",
      details: {},
    },
    match: {
      status: "idle",
      pool: 7,
      online: 7,
      playing: 2,
      pair: null,
      candidate: null,
      group: null,
      directory: [],
    },
    room: null,
  };

  const filter = {
    game: "",
    goal: "",
    rank: "",
    step: 0,
    direction: 1,
    ownRoles: ["不限"],
    teammateRoles: ["不限"],
    time: "现在",
    teamMin: 1,
    teamMax: 1,
    voice: "any",
  };

  let screen = "home";
  let casualIntent = "default";
  let advancedOpen = false;
  let consoleOpen = false;
  let network = "normal";
  let notice = "";
  let noticeTimer = 0;
  let rangeDrag = null;
  let pendingFocus = null;
  let chatMessages = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentStageLabel() {
    if (screen === "home") return filter.goal === "casual" ? `休闲 / ${casualIntentLabel()}` : filter.goal === "rank" ? "冲分配置" : "选择游戏";
    if (screen === "casual-intent") return `休闲 / ${casualIntentLabel()}`;
    if (screen === "matching") return "实时匹配";
    return state.room?.isForming ? "FORMING ROOM" : "正式房间";
  }

  function casualIntentLabel() {
    return { default: "随缘", hurry: "速度", fill: "满人" }[casualIntent] || "随缘";
  }

  function profileNeed(player, mode = state.need.mode || "casual") {
    return {
      game: "deadlock",
      mode,
      goal: mode === "casual" ? "休闲" : "冲分",
      voice: player.microphonePreference === "on",
      time: "现在",
      details: {
        rank: player.rankCode || (mode === "casual" ? "休闲" : "神谕者（钻石）"),
        role: mode === "casual" ? "位置不限" : "主核",
        teammateRole: "位置不限",
        voicePreference: player.microphonePreference || "any",
      },
    };
  }

  function groupMember(player, isOwner = false) {
    return {
      id: player.id,
      userId: player.id,
      isOwner,
      decision: "accepted",
      profile: { ...player, nickname: player.nickname },
      rankCode: player.rankCode || null,
      microphonePreference: player.microphonePreference || "any",
      mode: player.mode || "casual",
      need: profileNeed(player, player.mode || "casual"),
      nickname: player.nickname,
    };
  }

  function roomMember(member) {
    const player = member.profile || member;
    return {
      id: member.id || member.userId,
      nickname: player.nickname || member.nickname || "玩家",
      username: player.handle || player.id || member.id || member.userId,
      handle: player.handle || player.id || member.id || member.userId,
      avatarKey: player.avatarKey || "",
      online: player.online !== false,
      need: member.need || profileNeed(player, member.mode || state.need.mode || "casual"),
      memberStatus: "active",
    };
  }

  function directoryPeople() {
    return USERS.slice(1, 7).map((player) => ({
      nickname: player.nickname,
      gameId: "deadlock",
      mode: player.mode,
      rankCode: player.rankCode,
      desiredRoles: ["不限"],
      microphonePreference: player.microphonePreference,
    }));
  }

  function resetMatchState() {
    state.match.status = "idle";
    state.match.pair = null;
    state.match.candidate = null;
    state.match.group = null;
    state.match.directory = [];
    state.room = null;
    state.need = {
      game: "deadlock",
      mode: "",
      goal: "",
      current: 1,
      target: 2,
      time: "现在",
      duration: "不限",
      voice: true,
      playerType: "不限",
      details: {},
    };
    screen = "home";
    filter.game = "";
    filter.goal = "";
    filter.rank = "";
    filter.step = 0;
    filter.direction = 1;
    filter.ownRoles = ["不限"];
    filter.teammateRoles = ["不限"];
    filter.time = "现在";
    filter.teamMin = 1;
    filter.teamMax = 1;
    filter.voice = "any";
    casualIntent = "default";
    advancedOpen = false;
    network = "normal";
    chatMessages = [];
  }

  function matchingDirectory(entries = []) {
    const people = entries.slice(0, 6);
    return `<aside class="match-directory" data-directory-activity aria-label="正在摇人的玩家"><header><span><i></i>NOW MATCHING</span><b>正在摇人</b></header><div class="match-directory-list match-directory-list--activity">${people.length ? people.map((person) => `<article class="match-directory-player"><div class="match-directory-player-top"><b>${escapeHtml(person.nickname)}</b><span>${person.mode === "casual" ? "休闲" : "冲分"}</span></div><p>Deadlock · ${person.mode === "casual" ? "轻松开黑" : "段位待定"}</p><footer><span>位置不限</span><i>${person.microphonePreference === "on" ? "开麦" : person.microphonePreference === "off" ? "不开麦" : "都可以"}</i></footer></article>`).join("") : `<div class="match-directory-empty"><b>还没有公开的匹配请求</b><span>第一个开始摇人的人，会出现在这里。</span></div>`}</div></aside>`;
  }

  function casualIntentStepper() {
    const steps = ["游戏目的", "组队方式", "是否开麦"];
    return `<div class="match-wizard-stepper" data-home-stepper aria-label="Deadlock 休闲配置进度：第 2 步，共 3 步">
      ${steps.map((label, index) => {
        const status = index < 1 ? "is-complete" : index === 1 ? "is-active" : "is-pending";
        return `${index ? `<span class="match-wizard-line ${index <= 1 ? "is-complete" : ""}" aria-hidden="true"><i></i></span>` : ""}<span class="match-wizard-marker ${status}"><b>${status === "is-complete" ? icon("check", 13) : String(index + 1).padStart(2, "0")}</b><em>${label}</em></span>`;
      }).join("")}
    </div>`;
  }

  function casualAdvancedOptions() {
    const min = Number(filter.teamMin) || 1;
    const max = Number(filter.teamMax) || min;
    const minPercent = ((min - 1) / 4) * 100;
    const maxPercent = ((max - 1) / 4) * 100;
    const summary = min === max ? `严格匹配 ${min} 位队友` : `接受 ${min}–${max} 位队友`;
    const detents = [1, 2, 3, 4, 5].map((value) => `<span class="match-team-range-detent${value >= min && value <= max ? " is-active" : ""}${value === min || value === max ? " is-edge" : ""}" data-team-range-detent="${value}" style="left:${((value - 1) / 4) * 100}%"><i></i><b>${value}</b></span>`).join("");
    return `<div id="prototype-casual-advanced-panel" class="prototype-casual-advanced-panel" ${advancedOpen ? "" : "hidden"} aria-label="高级人数设置"><div class="prototype-casual-advanced-panel__head"><div><b>队友人数</b><span data-team-range-panel-summary>${summary}</span></div><small>拖动范围调整</small></div><div class="match-team-range" data-home-team-range role="group" aria-label="可接受的队友人数" style="--team-range-min:${minPercent}%;--team-range-max:${maxPercent}%;--team-range-fill-left:${minPercent}%;--team-range-fill-right:${100 - maxPercent}%"><div class="match-team-range-head"><strong data-team-range-summary>${summary}</strong></div><div class="match-team-range-track-wrap" data-home-team-range-track><div class="match-team-range-track" aria-hidden="true"><i data-team-range-fill></i><span class="match-team-range-track-glow"></span></div><div class="match-team-range-detents" aria-hidden="true">${detents}</div><span class="match-team-range-thumb match-team-range-thumb--min" data-team-range-thumb="min" aria-hidden="true"><i>MIN</i></span><span class="match-team-range-thumb match-team-range-thumb--max" data-team-range-thumb="max" aria-hidden="true"><i>MAX</i></span><input class="match-team-range-input match-team-range-input--min" type="range" min="1" max="${max}" step="1" value="${min}" name="teamMin" autocomplete="off" data-home-team-range-input="min" aria-label="最少接受 ${min} 位队友" /><input class="match-team-range-input match-team-range-input--max" type="range" min="${min}" max="5" step="1" value="${max}" name="teamMax" autocomplete="off" data-home-team-range-input="max" aria-label="最多接受 ${max} 位队友" /></div><div class="match-team-range-labels" aria-hidden="true"><span>1 位</span><span>2 位</span><span>3 位</span><span>4 位</span><span>5 位</span></div></div></div>`;
  }

  function customCasualIntentPage() {
    const choices = [
      ["default", "随缘", "不急着凑满，遇到合适的人就一起玩。", "dices"],
      ["hurry", "速度", "先找到一位就可以开聊，快点开一局。", "zap"],
      ["fill", "满人", "优先继续招募，尽量凑到游戏人数上限。", "users"],
    ];
    return homeShell(state, `<div class="match-workspace">
      <header class="match-head"><div><div class="match-eyebrow">01 / MATCH</div><h1>摇人</h1><p>总有人想一起玩</p></div><div class="match-head-tools"><span class="match-contact"><b>LOCAL MOCK</b><small>没有真实账号 / 不连接生产</small></span></div></header>
      <div class="match-content-grid"><div class="match-primary-stage"><section class="match-wizard">
        ${casualIntentStepper()}
        <div class="match-wizard-stage is-forward" data-home-wizard-stage data-home-step="intent">
          <div class="match-wizard-copy"><span>DEADLOCK / 02</span><h2>选择组队方式</h2><p>先选你的节奏；人数偏好可以放进更多高级选项。</p></div>
          <div class="match-wizard-options match-target-zone" data-target-cursor-zone><div class="match-choice-cards prototype-intent-cards" role="group" aria-label="组队意图">
            ${choices.map(([value, label, description, iconName]) => `<button type="button" class="cursor-target match-option match-choice-card ${casualIntent === value ? "is-on" : ""}" data-action="prototype-casual-intent" data-value="${value}" aria-pressed="${casualIntent === value}"><span class="match-choice-card-body"><span class="match-choice-card-title"><span class="match-option-icon">${icon(iconName, 18)}</span><b>${label}</b><span class="match-option-check">${icon("check", 11)}</span></span><small>${description}</small></span></button>`).join("")}
            <button type="button" class="cursor-target match-option match-choice-card prototype-more-card ${advancedOpen ? "is-on" : ""}" data-action="prototype-toggle-advanced" aria-label="更多（高级选项）" aria-expanded="${advancedOpen}" aria-controls="prototype-casual-advanced-panel"><span class="prototype-more-card__art" aria-hidden="true"><b>MORE</b><small>OPTIONS</small></span><span class="match-choice-card-body"><span class="match-choice-card-title prototype-more-card__title"><span class="match-option-icon">${icon("slidersHorizontal", 18)}</span><b>更多</b><small>高级选项</small><span class="match-option-check">${icon("check", 11)}</span></span><span class="prototype-more-card__summary">${advancedOpen ? "已展开人数设置" : "人数、范围与更多偏好"}</span></span></button>
          </div>${casualAdvancedOptions()}</div>
          <footer class="match-wizard-actions"><div class="match-wizard-actions-left"><button type="button" class="match-wizard-back" data-action="home-wizard-back">${icon("chevronLeft", 18)}<span>上一步</span></button><button type="button" class="match-back-games" data-action="home-back-games">${icon("gamepad2", 16)}<span>返回选择游戏</span></button></div><button type="button" class="match-wizard-next" data-action="prototype-casual-intent-next"><span>下一步</span>${icon("arrowRight", 20)}</button></footer>
        </div>
      </section></div>${matchingDirectory(state.match.directory)}</div>
    </div>`, "home");
  }

  function consoleMarkup() {
    const buttons = (items) => items.map(([action, label]) => `<button type="button" data-action="${action}">${label}</button>`).join("");
    return `<button type="button" class="prototype-console-toggle" data-action="prototype-toggle-console" aria-expanded="${consoleOpen}" aria-controls="prototype-dev-console">DEV</button><aside id="prototype-dev-console" class="prototype-console" ${consoleOpen ? "" : "hidden"} aria-label="开发控制台">
      <div class="prototype-console__head"><div><strong>DEV ONLY / MOCK STATE</strong><small>不连接 Production</small></div><button type="button" class="prototype-console__close" data-action="prototype-close-console" aria-label="关闭控制台">×</button></div>
      <div class="prototype-console__section"><div class="prototype-console__section-head"><strong>当前路径</strong><span>${escapeHtml(currentStageLabel())}</span></div><div class="prototype-console__buttons">${buttons([["prototype-reset", "Reset"], ["prototype-open-console", "保持展开"]])}</div></div>
      <div class="prototype-console__section"><div class="prototype-console__section-head"><strong>Matching</strong><span>${screen === "matching" ? "active" : "idle"}</span></div><div class="prototype-console__buttons">${buttons([["prototype-rank-found", "Ranked 找到队友"], ["prototype-casual-found", "Casual 首人加入"], ["prototype-add-player", "加入下一位"], ["prototype-remove-player", "移除最后一位"], ["prototype-full", "补到满员"], ["prototype-enter-room", "进入 Forming Room / Session"]])}</div></div>
      <div class="prototype-console__section"><div class="prototype-console__section-head"><strong>Network / Realtime</strong><span>${escapeHtml(network)}</span></div><div class="prototype-console__buttons">${buttons([["prototype-network-normal", "正常"], ["prototype-network-slow", "Slow loading"], ["prototype-network-error", "API error"], ["prototype-network-disconnect", "Realtime断开"], ["prototype-network-reconnect", "Reconnect"]])}</div></div>
      <p class="prototype-console__status">真实产品路径：选游戏 → Rank/休闲 → 随缘/速度/满人 → 麦克风 → 开始匹配 → Room / Session。所有数据只存在内存。</p>
    </aside>`;
  }

  function fakeRoomMembers() {
    const groupMembers = state.match.group?.members || [];
    if (groupMembers.length) return groupMembers.map(roomMember);
    const members = [{ ...groupMember(state.user, true) }];
    if (state.match.candidate) members.push(groupMember(state.match.candidate));
    return members.map(roomMember);
  }

  function roomFromMatch(forming = true) {
    const group = state.match.group;
    const isFull = Boolean(group && group.members.length >= Number(group.hardMaxPlayers || 6));
    state.room = {
      code: "MOCK",
      status: forming && !isFull ? "connecting" : "playing",
      sessionId: forming && !isFull ? null : "mock-session",
      isForming: forming && !isFull,
      formationGroupId: forming && !isFull ? "mock-group" : null,
      need: state.need,
      members: fakeRoomMembers(),
      goodbyeRequests: [],
    };
    state.match.status = "active";
  }

  function syncFormingRoomMembers() {
    if (!state.room || !state.match.group || !state.room.isForming) return;
    state.room.members = state.match.group.members.map(roomMember);
    state.room.need = state.need;
  }

  function startMatch() {
    if (networkBlocked("开始匹配")) return;
    const casual = filter.goal === "casual";
    state.need = {
      game: "deadlock",
      mode: casual ? "casual" : "ranked",
      goal: casual ? "休闲" : "冲分",
      current: 1,
      target: casual ? 6 : 2,
      desiredTeammates: casual ? Number(filter.teamMax) : 1,
      minTeammates: casual ? Number(filter.teamMin) : 1,
      hardMaxPlayers: casual ? 6 : 2,
      time: filter.time,
      duration: "不限",
      voice: filter.voice !== "off",
      playerType: "不限",
      details: {
        rank: filter.rank || "神谕者（钻石）",
        role: filter.ownRoles.join(" / "),
        teammateRole: filter.teammateRoles.join(" / "),
        voicePreference: filter.voice,
        casualIntent: casual ? casualIntent : null,
      },
    };
    state.match.status = "active";
    state.match.pool = 7;
    state.match.directory = [];
    state.match.pair = null;
    state.match.candidate = null;
    state.match.group = null;
    state.room = null;
    screen = "matching";
    showNotice("正在进入本地匹配池…");
  }

  function showNotice(message) {
    notice = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice = ""; render(); }, 2200);
  }

  function networkBlocked(actionLabel) {
    if (network === "error") {
      showNotice(`API error：${actionLabel}未提交`);
      return true;
    }
    if (network === "disconnect" || network === "reconnecting") {
      showNotice(`Realtime 未连接：${actionLabel}暂缓`);
      return true;
    }
    return false;
  }

  function applyNetwork(next) {
    network = next;
    if (next === "reconnect") {
      network = "reconnecting";
      showNotice("Realtime 正在重新连接…");
      window.setTimeout(() => {
        network = "normal";
        showNotice("Realtime 已重新连接");
        render();
      }, 700);
    } else if (next === "slow") showNotice("模拟慢加载：状态会在片刻后更新");
    else if (next === "error") showNotice("模拟 API error：本次操作未提交");
    else if (next === "disconnect") showNotice("Realtime disconnected，正在重连…");
    render();
  }

  function setRankFound() {
    filter.game = "deadlock";
    filter.goal = "rank";
    filter.step = 3;
    state.need.mode = "ranked";
    state.need.goal = "冲分";
    state.match.group = null;
    state.match.candidate = { ...USERS[1] };
    state.match.pair = { state: "matched", confirmations: [] };
    screen = "matching";
    showNotice("找到合法队友：Mira Chen");
  }

  function ensureCasualGroup() {
    state.need.mode = "casual";
    state.need.goal = "休闲";
    state.need.target = Math.max(2, Number(state.need.target || 6));
    state.need.hardMaxPlayers = state.need.target;
    state.need.desiredTeammates = state.need.target - 1;
    state.need.minTeammates = 1;
    state.match.group = {
      id: "mock-group",
      state: "forming",
      ownerUserId: state.user.id,
      desiredTeammates: state.need.desiredTeammates,
      minTeammates: 1,
      hardMaxPlayers: state.need.target,
      members: [groupMember(state.user, true), groupMember(USERS[2])],
    };
    state.match.candidate = null;
    state.match.pair = null;
    screen = "matching";
    showNotice("第一位玩家已加入，FORMING ROOM 已建立");
  }

  function addPlayer() {
    if (!state.match.group) return showNotice("请先模拟 Casual 首人加入");
    if (networkBlocked("新成员加入")) return;
    const group = state.match.group;
    const next = USERS.find((player) => !group.members.some((member) => member.userId === player.id));
    if (!next) return showNotice("没有更多 mock 玩家");
    if (group.members.length >= Number(group.hardMaxPlayers || 6)) return showNotice("已达到 hard max，停止招募");
    group.members.push(groupMember(next));
    group.state = group.members.length >= Number(group.hardMaxPlayers || 6) ? "full" : "forming";
    syncFormingRoomMembers();
    if (state.room?.isForming && group.members.length >= Number(group.hardMaxPlayers || 6)) {
      state.room.isForming = false;
      state.room.status = "playing";
      state.room.sessionId = "mock-session";
      state.room.formationGroupId = null;
      consoleOpen = false;
      showNotice("已满员，招募自动停止，进入正式 Session");
      return;
    }
    showNotice(`${next.nickname} 已加入 Room`);
  }

  function removePlayer() {
    const group = state.match.group;
    if (networkBlocked("成员离开")) return;
    if (!group || group.members.length <= 2) return showNotice("至少保留你和一位队友");
    const removed = group.members.pop();
    group.state = "forming";
    syncFormingRoomMembers();
    showNotice(`${removed.profile?.nickname || "成员"} 已离开，房间继续招募`);
  }

  function roomFromConsole() {
    if (networkBlocked("进入 Room")) return;
    if (screen === "matching" && !state.match.group && state.match.candidate) {
      roomFromMatch(false);
    } else {
      if (!state.match.group) ensureCasualGroup();
      roomFromMatch(true);
    }
    screen = "room";
    consoleOpen = false;
    showNotice("已进入本地 Room / Session");
  }

  function fullGroup() {
    if (!state.match.group) ensureCasualGroup();
    while (state.match.group.members.length < Number(state.match.group.hardMaxPlayers || 6)) {
      const before = state.match.group.members.length;
      addPlayer();
      if (state.match.group.members.length === before) break;
    }
    state.match.group.state = "full";
    render();
  }

  function decorateShell() {
    const shell = root.querySelector(".product-shell");
    if (!shell) return;
    shell.classList.add("prototype-mirror-shell");
    const topbarSection = shell.querySelector(".product-topbar-kicker b");
    if (topbarSection && screen === "room") topbarSection.textContent = state.room?.isForming ? "FORMING ROOM" : "进行中的房间";
    const brand = shell.querySelector(".product-brand");
    if (brand) {
      brand.setAttribute("href", "#/");
      brand.setAttribute("aria-label", "本地 Matching V2 原型");
    }
    const main = shell.querySelector(".home-main");
    if (main) {
      main.id = "prototype-main-content";
      main.tabIndex = -1;
    }
    shell.querySelectorAll('a[href="#/community"], a[href="#/me"]').forEach((link) => link.remove());
    shell.querySelectorAll(".product-rail-footer, .product-user-actions").forEach((element) => element.remove());
    const chatSend = shell.querySelector('[data-form="room-chat"] button[type="submit"]');
    if (chatSend) {
      chatSend.type = "button";
      chatSend.dataset.action = "prototype-send-chat";
    }
  }

  function networkBanner() {
    const copy = {
      slow: ["loader", "加载较慢…", "本地 mock 正在等待响应，页面仍可继续检查。"],
      error: ["triangleAlert", "API error", "这次操作不会提交；点击 DEV → 正常可恢复。"],
      disconnect: ["wifiOff", "Realtime disconnected", "成员变化暂时暂停，正在等待重新连接。"],
      reconnecting: ["refreshCw", "正在重新连接…", "Realtime 通道恢复后会继续更新成员状态。"],
    }[network];
    if (!copy) return "";
    const [iconName, title, description] = copy;
    return `<div class="prototype-network-banner prototype-network-banner--${network}" role="status" aria-live="polite"><span aria-hidden="true">${icon(iconName, 16)}</span><strong>${title}</strong><small>${description}</small>${network === "disconnect" ? `<button type="button" data-action="prototype-network-reconnect">重新连接</button>` : ""}</div>`;
  }

  function restoreChatMessages() {
    const messages = root.querySelector(".session-preview-messages");
    if (!messages || !chatMessages.length) return;
    messages.innerHTML = chatMessages.map((message) => `<div class="session-preview-message session-preview-message--me"><span>你</span><p>${escapeHtml(message)}</p><time>刚刚</time></div>`).join("");
  }

  function renderContent() {
    if (screen === "matching") return matchingPage(state);
    if (screen === "room") return sessionPage(state);
    if (screen === "casual-intent") return customCasualIntentPage();
    return homePage(state, filter);
  }

  function describeFocus(element) {
    if (!element) return null;
    return {
      id: element.id || "",
      action: element.dataset?.action || "",
      value: element.dataset?.value || "",
      range: element.dataset?.homeTeamRangeInput || "",
    };
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!active || !root.contains(active)) return null;
    return describeFocus(active);
  }

  function restoreFocus(descriptor) {
    if (!descriptor) {
      const dialog = root.querySelector('[role="dialog"][aria-modal="true"]');
      if (dialog) {
        dialog.tabIndex = -1;
        dialog.focus({ preventScroll: true });
      }
      return;
    }
    const candidate = [...root.querySelectorAll("[data-action], [data-home-team-range-input], #prototype-main-content")].find((element) => {
      if (descriptor.id && element.id === descriptor.id) return true;
      if (descriptor.range && element.dataset?.homeTeamRangeInput === descriptor.range) return true;
      return descriptor.action && element.dataset?.action === descriptor.action && element.dataset?.value === descriptor.value;
    });
    if (candidate && typeof candidate.focus === "function") candidate.focus({ preventScroll: true });
  }

  function syncUrl() {
    if (!window.history?.replaceState) return;
    const params = new URLSearchParams();
    if (filter.game) params.set("game", filter.game);
    if (filter.goal) params.set("goal", filter.goal);
    if (filter.step) params.set("step", String(filter.step));
    if (filter.goal === "casual") {
      params.set("intent", casualIntent);
      params.set("teamMin", String(filter.teamMin));
      params.set("teamMax", String(filter.teamMax));
    }
    if (screen === "casual-intent") params.set("screen", screen);
    if (advancedOpen) params.set("advanced", "1");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const game = params.get("game");
    const goal = params.get("goal");
    const step = Number(params.get("step"));
    const intent = params.get("intent");
    if (game === "deadlock") filter.game = game;
    if (goal === "rank" || goal === "casual") filter.goal = goal;
    if (Number.isInteger(step) && step >= 0 && step <= 3) filter.step = step;
    if (["default", "hurry", "fill"].includes(intent)) casualIntent = intent;
    const min = Number(params.get("teamMin"));
    const max = Number(params.get("teamMax"));
    if (filter.goal === "casual") {
      filter.teamMin = Math.min(5, Math.max(1, Number.isInteger(min) ? min : filter.teamMin));
      filter.teamMax = Math.min(5, Math.max(filter.teamMin, Number.isInteger(max) ? max : filter.teamMax));
    }
    advancedOpen = params.get("advanced") === "1";
    if (params.get("screen") === "casual-intent" && filter.game === "deadlock" && filter.goal === "casual") {
      screen = "casual-intent";
      filter.step = 0;
    }
  }

  function render() {
    if (!root) return;
    const focused = captureFocus() || pendingFocus;
    pendingFocus = null;
    root.innerHTML = `${renderContent()}${networkBanner()}${consoleMarkup()}${notice ? `<div class="prototype-mirror-notice" role="status">${escapeHtml(notice)}</div>` : ""}`;
    decorateShell();
    restoreChatMessages();
    restoreFocus(focused);
    syncUrl();
  }

  function updateRangeFromPointer(event) {
    if (!rangeDrag) return;
    const track = rangeDrag.track || root.querySelector("[data-home-team-range-track]");
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const value = Math.min(5, Math.max(1, Math.round(1 + ratio * 4)));
    if (rangeDrag.source === "min") filter.teamMin = Math.min(value, filter.teamMax);
    else filter.teamMax = Math.max(value, filter.teamMin);
    const min = filter.teamMin;
    const max = filter.teamMax;
    const summary = min === max ? `严格匹配 ${min} 位队友` : `接受 ${min}–${max} 位队友`;
    root.querySelectorAll("[data-home-team-range]").forEach((range) => {
      const minPercent = ((min - 1) / 4) * 100;
      const maxPercent = ((max - 1) / 4) * 100;
      range.style.setProperty("--team-range-min", `${minPercent}%`);
      range.style.setProperty("--team-range-max", `${maxPercent}%`);
      range.style.setProperty("--team-range-fill-left", `${minPercent}%`);
      range.style.setProperty("--team-range-fill-right", `${100 - maxPercent}%`);
    });
    root.querySelectorAll("[data-team-range-summary], [data-team-range-panel-summary]").forEach((element) => { element.textContent = summary; });
    const minInput = root.querySelector('[data-home-team-range-input="min"]');
    const maxInput = root.querySelector('[data-home-team-range-input="max"]');
    if (minInput) { minInput.value = String(min); minInput.setAttribute("aria-label", `最少接受 ${min} 位队友`); }
    if (maxInput) { maxInput.value = String(max); maxInput.setAttribute("aria-label", `最多接受 ${max} 位队友`); }
  }

  function toggleRoleSelection(key, value) {
    const selected = filter[key];
    if (value === "不限") {
      filter[key] = ["不限"];
      return;
    }
    filter[key] = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected.filter((item) => item !== "不限"), value];
    if (!filter[key].length) filter[key] = ["不限"];
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const value = target.dataset.value;
    pendingFocus = describeFocus(target);

    if (action === "prototype-toggle-console" || action === "prototype-open-console") {
      consoleOpen = true;
      render();
      return;
    }
    if (action === "prototype-close-console") {
      consoleOpen = false;
      render();
      return;
    }
    if (action === "prototype-reset") {
      resetMatchState();
      consoleOpen = false;
      render();
      return;
    }
    if (action === "prototype-network-normal") return applyNetwork("normal");
    if (action === "prototype-network-slow") return applyNetwork("slow");
    if (action === "prototype-network-error") return applyNetwork("error");
    if (action === "prototype-network-disconnect") return applyNetwork("disconnect");
    if (action === "prototype-network-reconnect") return applyNetwork("reconnect");
    if (action === "prototype-send-chat") {
      submitChatForm(target.form);
      return;
    }
    if (action === "prototype-rank-found") return setRankFound(), render();
    if (action === "prototype-casual-found") return ensureCasualGroup(), render();
    if (action === "prototype-add-player") return addPlayer(), render();
    if (action === "prototype-remove-player") return removePlayer(), render();
    if (action === "prototype-full") return fullGroup();
    if (action === "prototype-enter-room") return roomFromConsole(), render();

    if (action === "home-game") {
      filter.game = value || "deadlock";
      filter.goal = "";
      filter.step = 0;
      filter.direction = 1;
      state.match.directory = directoryPeople();
      return render();
    }
    if (action === "home-goal") {
      filter.goal = value;
      filter.step = 0;
      filter.direction = 1;
      if (value === "casual") {
        screen = "casual-intent";
        filter.teamMin = 1;
        filter.teamMax = 5;
        advancedOpen = false;
      }
      return render();
    }
    if (action === "prototype-casual-intent") {
      casualIntent = value || "default";
      if (casualIntent === "hurry") {
        filter.teamMin = 1;
        filter.teamMax = 1;
      } else if (casualIntent === "fill") {
        filter.teamMin = 5;
        filter.teamMax = 5;
      } else {
        filter.teamMin = 1;
        filter.teamMax = 5;
      }
      return render();
    }
    if (action === "prototype-toggle-advanced") {
      advancedOpen = !advancedOpen;
      return render();
    }
    if (action === "prototype-casual-intent-next") {
      filter.goal = "casual";
      filter.step = 2;
      screen = "home";
      return render();
    }
    if (action === "home-rank") {
      filter.rank = value || filter.rank;
      return render();
    }
    if (action === "home-own-role" || action === "home-teammate-role") {
      toggleRoleSelection(action === "home-own-role" ? "ownRoles" : "teammateRoles", value || "不限");
      return render();
    }
    if (action === "home-voice") {
      filter.voice = value || "any";
      return render();
    }
    if (action === "home-time") {
      filter.time = value || "现在";
      return render();
    }
    if (action === "home-wizard-next") {
      const maxStep = filter.goal === "casual" ? 2 : 3;
      filter.step = Math.min(maxStep, filter.step + 1);
      filter.direction = 1;
      return render();
    }
    if (action === "home-wizard-back") {
      if (screen === "casual-intent") {
        screen = "home";
        filter.goal = "";
        filter.step = 0;
      } else if (filter.goal === "casual" && filter.step === 2) {
        screen = "casual-intent";
        filter.step = 0;
      } else if (filter.step <= 0) {
        filter.game = "";
        filter.goal = "";
      } else {
        filter.step -= 1;
      }
      filter.direction = -1;
      return render();
    }
    if (action === "home-back-games") {
      resetMatchState();
      return render();
    }
    if (action === "home-start-match") return startMatch(), render();
    if (action === "lock-forming-room") {
      if (networkBlocked("锁定房间")) { render(); return; }
      if (state.room) {
        state.room.isForming = false;
        state.room.status = "playing";
        state.room.sessionId = "mock-session";
        state.room.formationGroupId = null;
        state.match.group = null;
        showNotice("Room 已锁定，进入正式 Session");
        return render();
      }
      return roomFromConsole(), render();
    }
    if (action === "cancel-match" || action === "exit-room") {
      resetMatchState();
      return render();
    }
    if (action === "say-goodbye" || action === "withdraw-goodbye") {
      if (networkBlocked("拜拜请求")) { render(); return; }
      showNotice(action === "say-goodbye" ? "已发送拜拜请求（本地模拟）" : "已撤回拜拜请求（本地模拟）");
      return render();
    }
    if (action === "toggle-account-menu" || action === "go-me" || action === "logout" || action === "open-feedback") {
      event.preventDefault();
      showNotice("该入口在隔离原型中不启用");
      return render();
    }
    if (action === "confirm-match") return roomFromConsole(), render();
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-home-team-range-input]");
    if (!input) return;
    const value = Number(input.value) || 1;
    if (input.dataset.homeTeamRangeInput === "min") filter.teamMin = Math.min(value, filter.teamMax);
    else filter.teamMax = Math.max(value, filter.teamMin);
    render();
  });

  root.addEventListener("pointerdown", (event) => {
    const track = event.target.closest("[data-home-team-range-track]");
    if (!track) return;
    const thumb = event.target.closest("[data-team-range-thumb]");
    const value = Math.min(5, Math.max(1, Math.round(1 + ((event.clientX - track.getBoundingClientRect().left) / Math.max(1, track.getBoundingClientRect().width)) * 4)));
    const source = thumb?.dataset.teamRangeThumb || (Math.abs(value - filter.teamMin) <= Math.abs(value - filter.teamMax) ? "min" : "max");
    rangeDrag = { source, track, pointerId: event.pointerId };
    track.setPointerCapture?.(event.pointerId);
    updateRangeFromPointer(event);
    event.preventDefault();
  });

  root.addEventListener("pointermove", (event) => {
    if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;
    updateRangeFromPointer(event);
    event.preventDefault();
  });

  function finishRangeDrag(event) {
    if (!rangeDrag || (event?.pointerId != null && event.pointerId !== rangeDrag.pointerId)) return;
    rangeDrag.track?.releasePointerCapture?.(rangeDrag.pointerId);
    rangeDrag = null;
    render();
  }

  root.addEventListener("pointerup", finishRangeDrag);
  root.addEventListener("pointercancel", finishRangeDrag);

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (screen === "matching" || screen === "room")) {
      event.preventDefault();
      resetMatchState();
      render();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.target.closest?.('[role="dialog"][aria-modal="true"]');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function submitChatForm(form) {
    if (!form) return;
    const input = form.querySelector("input");
    const message = input?.value?.trim();
    if (!message) return;
    if (networkBlocked("聊天消息")) { render(); return; }
    chatMessages.push(message);
    const messages = form.closest(".session-preview-chat")?.querySelector(".session-preview-messages");
    if (messages) {
      messages.querySelector(".chat-empty")?.remove();
      messages.insertAdjacentHTML("beforeend", `<div class="session-preview-message session-preview-message--me"><span>你</span><p>${escapeHtml(message)}</p><time>刚刚</time></div>`);
      input.value = "";
    }
  }

  root.addEventListener("submit", (event) => {
    const form = event.target.closest('[data-form="room-chat"]');
    if (!form) return;
    event.preventDefault();
    submitChatForm(form);
  });

  root.addEventListener("click", (event) => {
    const send = event.target.closest('[data-form="room-chat"] button[type="submit"]');
    if (send) {
      event.preventDefault();
      submitChatForm(send.form);
      return;
    }
    const quick = event.target.closest("[data-chat-quick-reply]");
    if (!quick) return;
    const input = root.querySelector("#chat-input");
    if (input) {
      input.value = quick.dataset.chatQuickReply || "";
      input.focus();
    }
  });

  state.match.directory = [];
  restoreFromUrl();
  render();
}
