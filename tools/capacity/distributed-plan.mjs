const DEFAULT_USERS = 200;
const DEFAULT_CYCLES = 3;
const DEFAULT_MINIMUM_EGRESS = 7;
const RANK_CODES = [
  "initiate", "seeker", "alchemist", "arcanist", "ritualist",
  "emissary", "archon", "oracle", "phantom", "ascendant",
];

function assertId(value, label) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(normalized)) {
    throw new Error(`CAPACITY_DISTRIBUTED: invalid ${label}`);
  }
  return normalized;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seed) {
  const result = [...values];
  const random = randomFrom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function rankedMatch(index, cycleNumber) {
  const pairIndex = Math.floor(index / 2);
  const role = ((pairIndex + cycleNumber) % 6) + 1;
  return {
    gameId: "deadlock",
    mode: "ranked",
    rankCode: RANK_CODES[(pairIndex + cycleNumber - 1) % RANK_CODES.length],
    desiredRoles: [role],
    ownRoles: [role],
    teammateRoles: [role],
    microphonePreference: ["any", "on", "off"][(pairIndex + cycleNumber) % 3],
  };
}

function casualMatch(index, cycleNumber) {
  const intentIndex = (index + cycleNumber - 1) % 4;
  const intent = ["default", "hurry", "fill", "advanced"][intentIndex];
  const desiredTeammates = intent === "hurry" ? 1 : intent === "fill" ? 5 : intent === "advanced" ? 3 + (index % 3) : 2 + (index % 3);
  const minTeammates = intent === "advanced" ? Math.max(1, desiredTeammates - 2) : intent === "hurry" ? 1 : desiredTeammates;
  return {
    gameId: "deadlock",
    mode: "casual",
    rankCode: null,
    desiredRoles: [],
    ownRoles: [],
    teammateRoles: [],
    microphonePreference: ["any", "on", "off"][(index + cycleNumber) % 3],
    recruitmentMode: intent === "hurry" ? "rush" : intent === "fill" ? "fill" : "open",
    desiredTeammates,
    minTeammates,
    intent,
  };
}

function cycleActors(actors, runId, cycleNumber) {
  const randomized = shuffled(actors, hashSeed(`${runId}:cycle:${cycleNumber}`));
  const half = Math.floor(randomized.length / 2);
  const rankedCount = half - (half % 2);
  return randomized.map((actor, index) => ({
    actorId: actor.actorId,
    match: index < rankedCount
      ? rankedMatch(index, cycleNumber)
      : casualMatch(index - rankedCount, cycleNumber),
  }));
}

function compatibleRank(a, b) {
  if (!a || !b) return false;
  if (a === "eternus" || b === "eternus") return a === b;
  const left = RANK_CODES.indexOf(a);
  const right = RANK_CODES.indexOf(b);
  return left >= 0 && right >= 0 && Math.abs(left - right) <= 1;
}

export function compatibleActorIds(cycle, actorId) {
  const actor = cycle.find((candidate) => candidate.actorId === actorId);
  if (!actor) return [];
  return cycle
    .filter((candidate) => candidate.actorId !== actorId)
    .filter((candidate) => candidate.match.gameId === actor.match.gameId && candidate.match.mode === actor.match.mode)
    .filter((candidate) => actor.match.mode !== "ranked" || compatibleRank(actor.match.rankCode, candidate.match.rankCode))
    .map((candidate) => candidate.actorId);
}

export function buildDistributedRunPlan({
  runId,
  actors,
  nodes,
  startAt = null,
  cycles = DEFAULT_CYCLES,
  requiredCompletedActors = null,
  minimumUniqueEgress = null,
} = {}) {
  const safeRunId = assertId(runId, "run id");
  if (!Array.isArray(actors) || actors.length < 5 || actors.length > DEFAULT_USERS) {
    throw new Error(`CAPACITY_DISTRIBUTED: 5 to ${DEFAULT_USERS} actors are required`);
  }
  const completionThreshold = requiredCompletedActors ?? Math.ceil(actors.length * 0.9);
  const egressThreshold = minimumUniqueEgress ?? (actors.length === DEFAULT_USERS ? DEFAULT_MINIMUM_EGRESS : 1);
  if (!Array.isArray(nodes) || nodes.length < egressThreshold) {
    throw new Error(`CAPACITY_DISTRIBUTED: at least ${egressThreshold} agents are required`);
  }
  if (cycles !== DEFAULT_CYCLES) throw new Error(`CAPACITY_DISTRIBUTED: exactly ${DEFAULT_CYCLES} cycles are required`);
  if (completionThreshold < 1 || completionThreshold > actors.length) {
    throw new Error("CAPACITY_DISTRIBUTED: invalid completion threshold");
  }

  const actorIds = actors.map((actor) => assertId(actor.actorId, "actor id"));
  if (new Set(actorIds).size !== actorIds.length) throw new Error("CAPACITY_DISTRIBUTED: actor ids must be unique");
  const nodeIds = nodes.map((node) => assertId(node.nodeId, "node id"));
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error("CAPACITY_DISTRIBUTED: node ids must be unique");

  const assignments = nodeIds.map((nodeId) => ({ nodeId, actorIds: [] }));
  actorIds.forEach((actorId, index) => assignments[index % assignments.length].actorIds.push(actorId));
  const workloadCycles = Array.from({ length: cycles }, (_, index) => ({
    cycle: index + 1,
    startAt: startAt ? new Date(new Date(startAt).getTime() + 180_000 + index * 720_000).toISOString() : null,
    roomHoldMs: 300_000,
    actors: cycleActors(actors, safeRunId, index + 1),
  }));
  for (const cycle of workloadCycles) {
    for (const actorId of actorIds) {
      if (!compatibleActorIds(cycle.actors, actorId).length) {
        throw new Error(`CAPACITY_DISTRIBUTED: ${actorId} is isolated in cycle ${cycle.cycle}`);
      }
    }
  }

  return {
    schemaVersion: 1,
    runId: safeRunId,
    users: actors.length,
    cycles,
    requiredCompletedActors: completionThreshold,
    minimumUniqueEgress: egressThreshold,
    authStartAt: startAt ? new Date(startAt).toISOString() : null,
    assignments,
    workload: { cycles: workloadCycles },
    safety: {
      productionMutationApprovalRequired: true,
      serviceRoleBusinessActions: false,
      rawSqlCleanup: false,
      secretsInPlan: false,
    },
  };
}

export function summarizeDistributedRun({ plan, reports } = {}) {
  if (!plan || !Array.isArray(reports)) throw new Error("CAPACITY_DISTRIBUTED: plan and reports are required");
  const assignedNodes = new Set(plan.assignments.map((assignment) => assignment.nodeId));
  const assignedActors = new Set(plan.assignments.flatMap((assignment) => assignment.actorIds));
  const actorResults = new Map();
  const egressIds = new Set();
  let fatal = false;
  let nonFatalErrors = 0;

  for (const report of reports) {
    if (!assignedNodes.has(report.nodeId)) throw new Error(`CAPACITY_DISTRIBUTED: unknown reporting node ${report.nodeId}`);
    if (report.egressId) egressIds.add(String(report.egressId));
    fatal ||= Boolean(report.fatal);
    nonFatalErrors += Number(report.nonFatalErrors || 0);
    for (const actor of report.actors || []) {
      if (!assignedActors.has(actor.actorId)) throw new Error(`CAPACITY_DISTRIBUTED: unknown reporting actor ${actor.actorId}`);
      if (actorResults.has(actor.actorId)) throw new Error(`CAPACITY_DISTRIBUTED: duplicate actor report ${actor.actorId}`);
      actorResults.set(actor.actorId, actor);
    }
  }

  const requiredCycles = Array.from({ length: plan.cycles }, (_, index) => index + 1);
  const completedActors = [];
  const exitedActors = [];
  for (const actorId of assignedActors) {
    const cycles = new Map((actorResults.get(actorId)?.cycles || []).map((cycle) => [Number(cycle.cycle), cycle]));
    if (requiredCycles.every((cycle) => cycles.get(cycle)?.completed === true)) completedActors.push(actorId);
    if (requiredCycles.every((cycle) => cycles.get(cycle)?.completed === true && cycles.get(cycle)?.exited === true)) exitedActors.push(actorId);
  }

  const multiIpVerified = egressIds.size >= plan.minimumUniqueEgress;
  const thresholdMet = completedActors.length >= plan.requiredCompletedActors && exitedActors.length >= plan.requiredCompletedActors;
  return {
    status: !fatal && multiIpVerified && thresholdMet ? "PASS" : "FAIL",
    users: plan.users,
    requiredCompletedActors: plan.requiredCompletedActors,
    completedAllCycles: completedActors.length,
    cleanlyExited: exitedActors.length,
    completedActorIds: completedActors,
    cleanlyExitedActorIds: exitedActors,
    uniqueEgress: egressIds.size,
    multiIpVerified,
    fatal,
    nonFatalErrors,
  };
}
