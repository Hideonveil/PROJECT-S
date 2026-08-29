import * as api from "./api.js?v=20260829-room-converge-03";
import { mergeRoomMessages } from "./chat-merge.js";
import { icon } from "./icons.js";
import { memberDisplayName } from "./session-members.js";
import { state } from "./store.js";
import { esc, toast } from "./ui.js";

export function createRoomChatController({ getRouteName, applyServerSnapshot, announceLive }) {
  let closeSubscription = null;
  let listenerController = null;
  let generation = 0;
  let sendPending = false;
  let announcementRoomId = "";
  let messages = [];
  const announcedMessages = new Set();

  function reset() {
    generation += 1;
    listenerController?.abort();
    listenerController = null;
    closeSubscription?.();
    closeSubscription = null;
  }

  async function init() {
    const room = state.room;
    if (!room?.id || !state.authenticated) return;
    const currentGeneration = generation;
    const isCurrent = () => currentGeneration === generation
      && ["room", "matching"].includes(getRouteName())
      && state.room?.id === room.id;
    let sb = null;
    let channel = null;
    let recoveryTimer = 0;
    let historyTimer = 0;
    let roomSnapshotTimer = 0;
    let realtimeSubscribed = false;
    let browserSessionReady = false;
    const currentListenerController = new AbortController();
    listenerController?.abort();
    listenerController = currentListenerController;

    const roomChanged = ensureRoomScope(room.id);
    if (roomChanged) {
      const chat = document.getElementById("room-chat");
      if (chat) chat.innerHTML = '<div class="chat-skeleton" role="status" aria-label="聊天记录加载中"><i></i><i></i><i></i></div>';
    }

    const reconcileHistory = async () => {
      const history = await api.fetchRoomMessages(room.code);
      if (!isCurrent()) return;
      const scoped = messages.filter((message) => !message?.room_id || message.room_id === room.id);
      renderMessages(mergeRoomMessages(scoped, history, room.id));
    };
    const reconcileSnapshot = async () => {
      const snapshot = await api.getRoomSnapshot(room.code);
      if (!isCurrent() || snapshot?.room?.id !== room.id) return;
      applyServerSnapshot(snapshot);
    };
    const scheduleSnapshot = (delay = 180) => {
      if (!isCurrent() || roomSnapshotTimer) return;
      roomSnapshotTimer = window.setTimeout(() => {
        roomSnapshotTimer = 0;
        reconcileSnapshot().catch(() => {});
      }, delay);
    };
    const close = () => {
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      if (historyTimer) window.clearTimeout(historyTimer);
      if (roomSnapshotTimer) window.clearTimeout(roomSnapshotTimer);
      if (channel && sb) sb.removeChannel(channel);
      currentListenerController.abort();
      if (listenerController === currentListenerController) listenerController = null;
      if (closeSubscription === close) closeSubscription = null;
    };
    const scheduleHistory = () => {
      if (!isCurrent() || historyTimer) return;
      const baseDelay = realtimeSubscribed && browserSessionReady ? 30_000 : 4_000;
      const jitterRange = realtimeSubscribed && browserSessionReady ? 15_000 : 2_000;
      historyTimer = window.setTimeout(async () => {
        historyTimer = 0;
        if (!isCurrent()) return;
        try { await reconcileHistory(); } catch { /* next bounded pass retries */ }
        if (!browserSessionReady && sb?.auth?.getSession) {
          try {
            const { data } = await sb.auth.getSession();
            browserSessionReady = Boolean(data?.session);
          } catch { /* keep recovery cadence */ }
        }
        scheduleHistory();
      }, baseDelay + Math.floor(Math.random() * jitterRange));
    };

    try { await reconcileHistory(); } catch { /* bounded recovery continues */ }
    if (!isCurrent()) return;
    closeSubscription = close;
    scheduleHistory();

    try {
      sb = await api.getSupabaseClient();
      if (!isCurrent()) return;
      try {
        const { data } = await sb.auth.getSession();
        browserSessionReady = Boolean(data?.session);
      } catch { /* authoritative history remains available */ }
      channel = sb.channel(`room-chat-${room.id}`);
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` }, (payload) => {
        if (isCurrent()) appendMessage(payload.new);
      });
      channel.on("postgres_changes", { event: "*", schema: "public", table: "room_state_events", filter: `room_id=eq.${room.id}` }, () => scheduleSnapshot());
      const scheduleRecovery = () => {
        if (recoveryTimer || !isCurrent()) return;
        recoveryTimer = window.setTimeout(() => {
          recoveryTimer = 0;
          reconcileHistory().catch(() => {});
        }, 800);
      };
      channel.subscribe((status) => {
        if (!isCurrent()) return;
        if (status === "SUBSCRIBED") {
          realtimeSubscribed = true;
          reconcileHistory().catch(() => {});
          scheduleSnapshot(0);
        }
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          realtimeSubscribed = false;
          const statusEl = document.querySelector("[data-chat-send-status]");
          if (statusEl) statusEl.textContent = "聊天连接正在恢复";
          scheduleRecovery();
        }
      });
      if (!isCurrent()) {
        sb.removeChannel(channel);
        return;
      }
    } catch {
      // Realtime accelerates delivery; authoritative history remains active.
    }
    if (!isCurrent()) return;
    document.querySelector('[data-form="room-chat"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    }, { signal: currentListenerController.signal });
    document.querySelectorAll("[data-chat-quick-reply]").forEach((reply) => {
      reply.addEventListener("click", () => send(reply.dataset.chatQuickReply || ""), { signal: currentListenerController.signal });
    });
  }

  function ensureRoomScope(roomId) {
    if (announcementRoomId === roomId) return false;
    announcementRoomId = roomId;
    announcedMessages.clear();
    messages = [];
    return true;
  }

  function setLoading(loading) {
    const form = document.querySelector('[data-form="room-chat"]');
    const input = document.getElementById("chat-input");
    const submit = form?.querySelector("button[type='submit']");
    if (!form || !submit) return;
    form.classList.toggle("is-loading", loading);
    form.setAttribute("aria-busy", String(loading));
    submit.disabled = loading;
    submit.setAttribute("aria-busy", String(loading));
    submit.setAttribute("aria-label", loading ? "消息发送中" : "发送");
    submit.innerHTML = loading ? icon("refreshCw", 17, "is-spinning") : icon("send", 17);
    if (input) input.disabled = loading;
    document.querySelectorAll("[data-chat-quick-reply]").forEach((reply) => { reply.disabled = loading; });
    const status = document.querySelector("[data-chat-send-status]");
    if (status) status.textContent = loading ? "消息发送中" : "";
  }

  function renderMessages(nextMessages) {
    const el = document.getElementById("room-chat");
    if (!el) return;
    const roomId = state.room?.id || "";
    ensureRoomScope(roomId);
    messages = mergeRoomMessages([], nextMessages, roomId);
    messages.forEach((message) => announcedMessages.add(messageKey(message)));
    if (!messages.length) {
      el.innerHTML = '<div class="chat-empty">还没有消息，打个招呼吧</div>';
      return;
    }
    el.innerHTML = messages.map(messageHtml).join("");
    el.scrollTop = el.scrollHeight;
  }

  function messageHtml(message) {
    const mine = message.sender_id === state.user.id;
    const system = message.kind && message.kind !== "chat";
    const senderMember = (state.room?.members || []).find((member) => member.id === message.sender_id || member.userId === message.sender_id);
    const senderName = mine ? "你" : memberDisplayName(senderMember, "玩家");
    const time = message.created_at ? new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
    const pending = message.delivery_status === "pending" ? " · 发送中" : "";
    const failed = message.delivery_status === "failed";
    return `<div class="chat-msg ${mine ? "chat-msg--mine" : ""} ${system ? "chat-msg--system" : ""} ${failed ? "is-failed" : ""}"><div class="chat-bubble">${system ? `<strong>${esc(senderName)}：</strong>` : ""}${esc(message.content || "")}</div><div class="chat-time">${time}${pending}${failed ? ` · <button type="button" data-action="retry-chat" data-value="${esc(message.client_operation_id || "")}">重试</button>` : ""}</div></div>`;
  }

  function messageKey(message) {
    return String(message?.client_operation_id || message?.id || `${message?.sender_id || ""}:${message?.created_at || ""}:${message?.content || ""}`);
  }

  function appendMessage(message) {
    const el = document.getElementById("room-chat");
    if (!el) return;
    const roomId = state.room?.id || "";
    if (message?.room_id && message.room_id !== roomId) return;
    ensureRoomScope(roomId);
    const key = messageKey(message);
    if (announcedMessages.has(key)) {
      renderMessages(mergeRoomMessages(messages, [message], roomId));
      return;
    }
    messages = mergeRoomMessages(messages, [message], roomId);
    el.querySelector(".chat-empty")?.remove();
    el.insertAdjacentHTML("beforeend", messageHtml(message));
    el.scrollTop = el.scrollHeight;
    announcedMessages.add(key);
    const sender = message.sender_id === state.user.id ? "你" : "队友";
    announceLive(`新消息：${sender}：${String(message.content || "")}`, `chat:${key}`);
  }

  async function send(message = null, existingOperationId = "") {
    const room = state.room;
    const input = document.getElementById("chat-input");
    const text = String(message ?? input?.value ?? "").trim();
    if (!room?.id || !room?.code || !text || sendPending) return;
    const operationId = existingOperationId || window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic = {
      id: `pending:${operationId}`,
      room_id: room.id,
      sender_id: state.user.id,
      content: text,
      kind: "chat",
      client_operation_id: operationId,
      created_at: new Date().toISOString(),
      delivery_status: "pending",
    };
    appendMessage(optimistic);
    sendPending = true;
    setLoading(true);
    try {
      const created = await api.sendRoomMessage(room.code, text, operationId);
      appendMessage({ ...created, delivery_status: "sent" });
      if (input) input.value = "";
      announceLive("消息已发送", `chat-sent:${Date.now()}`);
    } catch (error) {
      appendMessage({ ...optimistic, delivery_status: "failed" });
      toast(error.message || "消息发送失败");
    } finally {
      sendPending = false;
      setLoading(false);
    }
  }

  function retry(operationId) {
    const message = messages.find((item) => item.client_operation_id === operationId);
    if (message) send(message.content, operationId);
  }

  return { init, reset, retry };
}
