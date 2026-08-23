const url = process.env.NONPROD_SUPABASE_URL;
const serviceRoleKey = process.env.NONPROD_SUPABASE_SERVICE_ROLE_KEY;
const allowMutations = process.env.NONPROD_ALLOW_MUTATIONS === "1";

function fail(message) {
  throw new Error(message);
}

if (!url || !serviceRoleKey) {
  console.log(JSON.stringify({
    status: "UNVERIFIED",
    reason: "NONPROD_SUPABASE_URL and NONPROD_SUPABASE_SERVICE_ROLE_KEY are not configured",
  }, null, 2));
  process.exit(0);
}

if (!allowMutations) {
  fail("Refusing staging mutations without NONPROD_ALLOW_MUTATIONS=1");
}

const forbiddenHosts = [
  "chqxaqibegpdjtedrxwx.supabase.co",
  "jiyuan.online",
  "project-s-iota.vercel.app",
];
const hostname = new URL(url).hostname;
if (forbiddenHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
  fail(`Refusing to mutate forbidden production host: ${hostname}`);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let fixtureCounter = 0;
const created = {
  profileIds: [],
  roomIds: [],
  sessionIds: [],
  ticketIds: [],
  pairIds: [],
  groupIds: [],
};

async function must(result, label) {
  const resolved = await result;
  if (resolved.error) fail(`${label}: ${resolved.error.message}`);
  return resolved.data;
}

async function fixture({ status = "ready", game = "deadlock" } = {}) {
  const fixtureSuffix = `${suffix}-${++fixtureCounter}`;
  const profiles = await must(admin.from("profiles").insert([
    {
      nickname: `P0 A ${fixtureSuffix}`,
      friend_code: `p0-${fixtureSuffix}-a`,
      online: true,
    },
    {
      nickname: `P0 B ${fixtureSuffix}`,
      friend_code: `p0-${fixtureSuffix}-b`,
      online: true,
    },
  ]).select("id"), "create profiles");
  if (!Array.isArray(profiles) || profiles.length !== 2) {
    fail(`create profiles returned an unexpected payload: ${JSON.stringify(profiles)}`);
  }
  const [a, b] = profiles;
  created.profileIds.push(a.id, b.id);

  const room = await must(admin.from("rooms").insert({
    code: `P0${fixtureSuffix.replace(/[^A-Z0-9]/gi, "").slice(-12)}`,
    need: { game },
    status: status === "playing" ? "playing" : "ready",
  }).select("id,code,status").single(), "create room");
  created.roomIds.push(room.id);

  await must(admin.from("room_members").insert([
    { room_id: room.id, user_id: a.id, status: "active" },
    { room_id: room.id, user_id: b.id, status: "active" },
  ]), "create room members");

  const session = await must(admin.from("sessions").insert({
    room_id: room.id,
    room_code: room.code,
    players: [a.id, b.id],
    need: { game },
    outcome_by: {},
    rematch_by: {},
    status: status === "playing" ? "playing" : "ready",
  }).select("id,room_id,status").single(), "create session");
  created.sessionIds.push(session.id);

  if (status !== "playing") {
    await must(admin.rpc("phase1_start_session", {
      p_session_id: session.id,
      p_actor_id: a.id,
      p_request_id: `p0-start-${suffix}`,
    }), "start session");
  }

  return { room, session, a, b };
}

async function casualGroupFixture() {
  const fixtureSuffix = `${suffix}-${++fixtureCounter}`;
  const profiles = await must(admin.from("profiles").insert([
    {
      nickname: `P0 Group A ${fixtureSuffix}`,
      friend_code: `p0-${fixtureSuffix}-group-a`,
      online: true,
    },
    {
      nickname: `P0 Group B ${fixtureSuffix}`,
      friend_code: `p0-${fixtureSuffix}-group-b`,
      online: true,
    },
  ]).select("id"), "create group profiles");
  if (!Array.isArray(profiles) || profiles.length !== 2) {
    fail(`create group profiles returned an unexpected payload: ${JSON.stringify(profiles)}`);
  }
  const [a, b] = profiles;
  created.profileIds.push(a.id, b.id);

  const input = {
    gameId: "deadlock",
    mode: "casual",
    desiredTeammates: 1,
    minTeammates: 1,
    desiredRoles: [],
    microphonePreference: "any",
  };
  const ticketA = await must(admin.rpc("matchmaking_start_ticket", {
    p_user_id: a.id,
    p_input: input,
    p_request_id: `p0-group-ticket-a-${suffix}`,
  }), "start group ticket A");
  const ticketB = await must(admin.rpc("matchmaking_start_ticket", {
    p_user_id: b.id,
    p_input: input,
    p_request_id: `p0-group-ticket-b-${suffix}`,
  }), "start group ticket B");
  created.ticketIds.push(ticketA.id, ticketB.id);

  const group = await must(admin.rpc("matchmaking_ensure_group", { p_ticket_id: ticketA.id }), "ensure group");
  created.groupIds.push(group.id);
  await must(admin.rpc("matchmaking_reserve_group_member", {
    p_group_id: group.id,
    p_ticket_id: ticketB.id,
    p_hard_snapshot: {},
    p_soft_snapshot: {},
  }), "reserve group member");
  await must(admin.rpc("matchmaking_start_group", {
    p_group_id: group.id,
    p_user_id: a.id,
    p_request_id: `p0-group-start-${suffix}`,
  }), "start group");
  await must(admin.rpc("matchmaking_confirm_group", {
    p_group_id: group.id,
    p_user_id: a.id,
    p_decision: "accepted",
    p_request_id: `p0-group-confirm-a-${suffix}`,
  }), "confirm group A");
  await must(admin.rpc("matchmaking_confirm_group", {
    p_group_id: group.id,
    p_user_id: b.id,
    p_decision: "accepted",
    p_request_id: `p0-group-confirm-b-${suffix}`,
  }), "confirm group B");

  const currentGroup = await must(admin.from("matchmaking_groups").select("id,room_id,session_id,state").eq("id", group.id).single(), "read started group");
  if (!currentGroup.session_id || !currentGroup.room_id || currentGroup.state !== "playing") {
    fail(`group fixture did not reach playing: ${JSON.stringify(currentGroup)}`);
  }
  const room = await must(admin.from("rooms").select("id,code,status").eq("id", currentGroup.room_id).single(), "read group room");
  const session = await must(admin.from("sessions").select("id,room_id,status").eq("id", currentGroup.session_id).single(), "read group session");
  created.roomIds.push(room.id);
  created.sessionIds.push(session.id);
  return { a, b, group: currentGroup, room, session };
}

async function attachPairToSession(f) {
  const input = {
    gameId: "deadlock",
    mode: "ranked",
    rankCode: "initiate",
    desiredRoles: [],
    microphonePreference: "any",
  };
  const startedA = await must(admin.rpc("matchmaking_start_ticket", {
    p_user_id: f.a.id,
    p_input: input,
    p_request_id: `p0-pair-ticket-a-${suffix}`,
  }), "start pair ticket A");
  const startedB = await must(admin.rpc("matchmaking_start_ticket", {
    p_user_id: f.b.id,
    p_input: input,
    p_request_id: `p0-pair-ticket-b-${suffix}`,
  }), "start pair ticket B");
  created.ticketIds.push(startedA.id, startedB.id);
  const tickets = await must(admin.from("matchmaking_tickets")
    .select("id,user_id,rule_set_id")
    .in("id", [startedA.id, startedB.id]), "read pair tickets");
  const ticketA = tickets.find((ticket) => ticket.user_id === f.a.id);
  const ticketB = tickets.find((ticket) => ticket.user_id === f.b.id);
  const pair = await must(admin.from("matchmaking_pairs").insert({
    ticket_a_id: ticketA.id,
    ticket_b_id: ticketB.id,
    user_a_id: f.a.id,
    user_b_id: f.b.id,
    state: "playing",
    rule_set_id: ticketA.rule_set_id,
    confirmation_deadline: new Date().toISOString(),
    room_id: f.room.id,
    session_id: f.session.id,
    matched_at: new Date().toISOString(),
    playing_at: new Date().toISOString(),
  }).select("id,state,room_id,session_id").single(), "create linked pair");
  created.pairIds.push(pair.id);
  await must(admin.from("matchmaking_tickets").update({ state: "playing", pair_id: pair.id }).in("id", [ticketA.id, ticketB.id]), "link pair tickets");
  return pair;
}

async function state(sessionId, roomId) {
  const session = await must(admin.from("sessions").select("status,completion_reason").eq("id", sessionId).single(), "read session");
  const room = await must(admin.from("rooms").select("status").eq("id", roomId).single(), "read room");
  const members = await must(admin.from("room_members").select("status").eq("room_id", roomId), "read members");
  const recentResult = await admin.from("recent_connections").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  if (recentResult.error) fail(`read recent connections: ${recentResult.error.message}`);
  return {
    session: session.status,
    completionReason: session.completion_reason,
    room: room.status,
    memberStatuses: members.map((member) => member.status).sort(),
    recentConnections: recentResult.count ?? 0,
  };
}

async function lifecycleRows(sessionId) {
  const pairs = await must(admin.from("matchmaking_pairs").select("id,state").eq("session_id", sessionId), "read linked pairs");
  const groups = await must(admin.from("matchmaking_groups").select("id,state").eq("session_id", sessionId), "read linked groups");
  const pairIds = pairs.map((pair) => pair.id);
  const groupIds = groups.map((group) => group.id);
  const pairTickets = pairIds.length
    ? await must(admin.from("matchmaking_tickets").select("id,state,pair_id,group_id").in("pair_id", pairIds), "read pair tickets")
    : [];
  const groupTickets = groupIds.length
    ? await must(admin.from("matchmaking_tickets").select("id,state,pair_id,group_id").in("group_id", groupIds), "read group tickets")
    : [];
  return { pairs, groups, tickets: [...pairTickets, ...groupTickets] };
}

async function globalGhostCount() {
  if (!created.sessionIds.length) return 0;
  const sessions = await must(admin.from("sessions").select("id,room_id,status").in("id", created.sessionIds).in("status", ["cancelled", "completed"]), "scan terminal sessions");
  const roomIds = sessions.map((session) => session.room_id).filter(Boolean);
  if (!roomIds.length) return 0;
  const rooms = await must(admin.from("rooms").select("id,status").in("id", roomIds), "scan terminal rooms");
  const statusByRoom = new Map(rooms.map((room) => [room.id, room.status]));
  return sessions.filter((session) => statusByRoom.get(session.room_id) === "playing").length;
}

function assertLifecycleRows(rows, expected, label) {
  for (const row of [...rows.pairs, ...rows.groups, ...rows.tickets]) {
    assertEqual(row.state, expected, `${label} ${row.id}`);
  }
}

async function waitForRealtimeEvent(events, predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail(`${label}: timed out waiting for realtime event; observed=${JSON.stringify(events)}`);
}

async function subscribeRealtime(sessionId, roomId) {
  const events = [];
  const channel = admin
    .channel(`p0-realtime-${suffix}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "sessions",
      filter: `id=eq.${sessionId}`,
    }, (payload) => events.push({ table: "sessions", event: payload.eventType, at: Date.now() }))
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "rooms",
      filter: `id=eq.${roomId}`,
    }, (payload) => events.push({ table: "rooms", event: payload.eventType, at: Date.now() }))
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `room_id=eq.${roomId}`,
    }, (payload) => events.push({ table: "messages", event: payload.eventType, at: Date.now() }))
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "session_goodbye_requests",
      filter: `session_id=eq.${sessionId}`,
    }, (payload) => events.push({ table: "session_goodbye_requests", event: payload.eventType, at: Date.now() }));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime SUBSCRIBED timeout")), 7000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timeout);
        reject(new Error(`Realtime channel ${status}: ${JSON.stringify(error || {})}`));
      }
    });
  });
  return { channel, events };
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function expectNoGhost(sessionId, roomId, label) {
  const current = await state(sessionId, roomId);
  if (["cancelled", "completed"].includes(current.session) && current.room === "playing") {
    fail(`${label}: terminal Session + playing Room`);
  }
  return current;
}

const results = [];

try {
  {
    const f = await fixture();
    await must(admin.rpc("phase1_exit_room", {
      p_session_id: f.session.id,
      p_actor_id: f.a.id,
      p_request_id: `p0-exit-${suffix}`,
    }), "first exit");
    const afterFirst = await expectNoGhost(f.session.id, f.room.id, "first exit");
    assertEqual(afterFirst.session, "cancelled", "first exit Session");
    assertEqual(afterFirst.room, "cancelled", "first exit Room");
    assertEqual(afterFirst.memberStatuses, ["active", "exited"], "first exit members");

    await must(admin.rpc("phase1_exit_room", {
      p_session_id: f.session.id,
      p_actor_id: f.b.id,
      p_request_id: `p0-exit-second-${suffix}`,
    }), "second exit");
    await must(admin.rpc("phase1_exit_room", {
      p_session_id: f.session.id,
      p_actor_id: f.b.id,
      p_request_id: `p0-exit-second-repeat-${suffix}`,
    }), "repeated exit");
    const afterSecond = await expectNoGhost(f.session.id, f.room.id, "second exit");
    assertEqual(afterSecond.session, "cancelled", "second exit Session");
    assertEqual(afterSecond.room, "cancelled", "second exit Room");
    results.push({ name: "first-and-sequential-exit", status: "PASS", state: afterSecond });
  }

  {
    const f = await fixture();
    await Promise.allSettled([
      admin.rpc("phase1_exit_room", {
        p_session_id: f.session.id,
        p_actor_id: f.a.id,
        p_request_id: `p0-race-exit-${suffix}`,
      }),
      admin.rpc("phase1_request_goodbye", {
        p_session_id: f.session.id,
        p_actor_id: f.b.id,
        p_requested: true,
        p_request_id: `p0-race-goodbye-${suffix}`,
      }),
    ]);
    const current = await expectNoGhost(f.session.id, f.room.id, "exit-goodbye race");
    assertEqual(current.session, "cancelled", "exit-goodbye race Session");
    assertEqual(current.room, "cancelled", "exit-goodbye race Room");
    results.push({ name: "exit-goodbye-concurrency", status: "PASS", state: current });
  }

  {
    const f = await fixture();
    await must(admin.rpc("phase1_request_goodbye", {
      p_session_id: f.session.id,
      p_actor_id: f.a.id,
      p_requested: true,
      p_request_id: `p0-goodbye-a-${suffix}`,
    }), "goodbye A");
    const waiting = await state(f.session.id, f.room.id);
    assertEqual(waiting.session, "playing", "one goodbye Session");
    assertEqual(waiting.room, "playing", "one goodbye Room");

    await must(admin.rpc("phase1_request_goodbye", {
      p_session_id: f.session.id,
      p_actor_id: f.b.id,
      p_requested: true,
      p_request_id: `p0-goodbye-b-${suffix}`,
    }), "goodbye B");
    const completed = await expectNoGhost(f.session.id, f.room.id, "mutual goodbye");
    assertEqual(completed.session, "completed", "mutual goodbye Session");
    assertEqual(completed.room, "completed", "mutual goodbye Room");
    const recentBeforeRepeat = completed.recentConnections;

    await must(admin.rpc("phase1_request_goodbye", {
      p_session_id: f.session.id,
      p_actor_id: f.a.id,
      p_requested: true,
      p_request_id: `p0-goodbye-repeat-${suffix}`,
    }), "repeated goodbye");
    const repeated = await state(f.session.id, f.room.id);
    assertEqual(repeated.room, "completed", "repeated goodbye Room");
    assertEqual(repeated.recentConnections, recentBeforeRepeat, "repeated goodbye recent connections");
    results.push({ name: "mutual-goodbye", status: "PASS", state: repeated });
  }

  {
    const cancel = await fixture();
    await must(admin.from("sessions").update({
      status: "cancelled",
      ended_at: new Date().toISOString(),
      completion_reason: "direct_test",
      completed_by: cancel.a.id,
    }).eq("id", cancel.session.id), "direct cancellation");
    const cancelled = await expectNoGhost(cancel.session.id, cancel.room.id, "direct cancellation");
    assertEqual(cancelled.room, "cancelled", "direct cancellation Room");

    const complete = await fixture();
    await must(admin.from("sessions").update({
      status: "completed",
      ended_at: new Date().toISOString(),
      completion_reason: "direct_test",
      completed_by: complete.a.id,
    }).eq("id", complete.session.id), "direct completion");
    const completed = await expectNoGhost(complete.session.id, complete.room.id, "direct completion");
    assertEqual(completed.room, "completed", "direct completion Room");
    results.push({ name: "direct-terminal-session-updates", status: "PASS", state: { cancelled, completed } });
  }

  {
    const f = await fixture();
    await attachPairToSession(f);
    const linkedBefore = await lifecycleRows(f.session.id);
    assertLifecycleRows(linkedBefore, "playing", "pair/group/ticket playing lifecycle");
    await must(admin.rpc("phase1_exit_room", {
      p_session_id: f.session.id,
      p_actor_id: f.a.id,
      p_request_id: `p0-linked-exit-${suffix}`,
    }), "linked lifecycle exit");
    const linkedAfter = await lifecycleRows(f.session.id);
    assertLifecycleRows(linkedAfter, "cancelled", "pair/group/ticket cancelled lifecycle");
    results.push({
      name: "pair-group-ticket-lifecycle",
      status: "PASS",
      linkedRows: linkedAfter,
    });
  }

  {
    const f = await casualGroupFixture();
    const linkedBefore = await lifecycleRows(f.session.id);
    assertLifecycleRows(linkedBefore, "playing", "casual group playing lifecycle");
    await must(admin.rpc("phase1_exit_room", {
      p_session_id: f.session.id,
      p_actor_id: f.a.id,
      p_request_id: `p0-group-exit-${suffix}`,
    }), "casual group exit");
    const linkedAfter = await lifecycleRows(f.session.id);
    assertLifecycleRows(linkedAfter, "cancelled", "casual group cancelled lifecycle");
    results.push({ name: "casual-group-ticket-lifecycle", status: "PASS", linkedRows: linkedAfter });
  }

  {
    const f = await fixture();
    const realtime = await subscribeRealtime(f.session.id, f.room.id);
    try {
      await must(admin.from("messages").insert({
        room_id: f.room.id,
        sender_id: f.a.id,
        content: `p0 realtime ${suffix}`,
      }), "realtime message insert");
      await must(admin.rpc("phase1_request_goodbye", {
        p_session_id: f.session.id,
        p_actor_id: f.a.id,
        p_requested: true,
        p_request_id: `p0-realtime-goodbye-${suffix}`,
      }), "realtime goodbye");
      await must(admin.rpc("phase1_exit_room", {
        p_session_id: f.session.id,
        p_actor_id: f.b.id,
        p_request_id: `p0-realtime-exit-${suffix}`,
      }), "realtime exit");

      await waitForRealtimeEvent(realtime.events, (event) => event.table === "messages", "Realtime message INSERT");
      await waitForRealtimeEvent(realtime.events, (event) => event.table === "session_goodbye_requests", "Realtime goodbye INSERT");
      await waitForRealtimeEvent(realtime.events, (event) => event.table === "sessions", "Realtime Session UPDATE");
      await waitForRealtimeEvent(realtime.events, (event) => event.table === "rooms", "Realtime Room UPDATE");

      const counts = Object.fromEntries(["messages", "session_goodbye_requests", "sessions", "rooms"].map((table) => [
        table,
        realtime.events.filter((event) => event.table === table).length,
      ]));
      for (const [table, count] of Object.entries(counts)) {
        assertEqual(count, 1, `Realtime ${table} event count`);
      }
      const sessionAt = realtime.events.find((event) => event.table === "sessions")?.at;
      const roomAt = realtime.events.find((event) => event.table === "rooms")?.at;
      if (!(sessionAt <= roomAt)) fail(`Realtime Session UPDATE must precede Room UPDATE: ${JSON.stringify(realtime.events)}`);
      results.push({
        name: "realtime-session-room-message-goodbye",
        status: "PASS",
        events: realtime.events,
        duplicateEvents: realtime.events.length - new Set(realtime.events.map((event) => `${event.table}:${event.event}`)).size,
      });
    } finally {
      await admin.removeChannel(realtime.channel);
    }
  }

  const remainingGhosts = await globalGhostCount();
  assertEqual(remainingGhosts, 0, "global terminal Session + playing Room invariant");
  results.push({ name: "global-terminal-room-invariant", status: "PASS", remainingGhosts });

  console.log(JSON.stringify({ status: "PASS", results }, null, 2));
} finally {
  if (created.ticketIds.length) {
    await must(admin.from("matchmaking_tickets").update({ pair_id: null }).in("id", created.ticketIds), "detach test pair tickets");
  }
  if (created.pairIds.length) {
    await must(admin.from("matchmaking_pairs").delete().in("id", created.pairIds), "delete test pairs");
  }
  if (created.groupIds.length) {
    await must(admin.from("matchmaking_groups").delete().in("id", created.groupIds), "delete test groups");
  }
  if (created.ticketIds.length) {
    await must(admin.from("matchmaking_tickets").delete().in("id", created.ticketIds), "delete test tickets");
  }
  for (const sessionId of created.sessionIds) {
    await must(admin.from("sessions").delete().eq("id", sessionId), "delete test session");
  }
  for (const roomId of created.roomIds) {
    await must(admin.from("rooms").delete().eq("id", roomId), "delete test room");
  }
  for (const profileId of created.profileIds) {
    await must(admin.from("profiles").delete().eq("id", profileId), "delete test profile");
  }
  await admin.removeAllChannels();
}
