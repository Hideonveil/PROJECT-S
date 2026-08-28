import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDistributedRunPlan,
  compatibleActorIds,
  summarizeDistributedRun,
} from "../tools/capacity/distributed-plan.mjs";
import { writeAgentBundles } from "../tools/capacity/distributed-bundles.mjs";
import { runDistributedAgent } from "../tools/capacity/distributed-agent.mjs";
import { actorMatched, isMatchedRoomState } from "../tools/capacity/production-agent-driver.mjs";

function actors(count = 200) {
  return Array.from({ length: count }, (_, index) => ({
    actorId: `S${String(index + 1).padStart(3, "0")}`,
    userId: `user-${index + 1}`,
    profile: "synthetic_test",
  }));
}

function nodes(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: `node-${String(index + 1).padStart(2, "0")}`,
  }));
}

describe("distributed capacity coordinator contract", () => {
  it("treats a Casual Room with one peer as matched despite a six-player soft preference", () => {
    expect(actorMatched({ room: { members: [{ status: "active" }, { status: "active" }] }, session: null }, {
      mode: "casual",
      minTeammates: 5,
      preferredTotalPlayers: 6,
    })).toBe(true);
  });

  it("plans 200 matchable users across ten independent agents for three cycles", () => {
    const plan = buildDistributedRunPlan({
      runId: "cap200-three-cycle",
      actors: actors(),
      nodes: nodes(),
    });

    expect(plan).toMatchObject({
      runId: "cap200-three-cycle",
      users: 200,
      cycles: 3,
      requiredCompletedActors: 180,
      minimumUniqueEgress: 7,
      authStaggerMs: 15_000,
    });
    expect(plan.assignments).toHaveLength(10);
    expect(plan.assignments.map((assignment) => assignment.actorIds.length)).toEqual(Array(10).fill(20));
    expect(new Set(plan.assignments.flatMap((assignment) => assignment.actorIds)).size).toBe(200);

    for (const cycle of plan.workload.cycles) {
      expect(cycle.roomHoldMs).toBe(120_000);
      expect(cycle.actors.filter((actor) => actor.match.mode === "ranked")).toHaveLength(100);
      expect(cycle.actors.filter((actor) => actor.match.mode === "casual")).toHaveLength(100);
      for (const actor of cycle.actors) {
        expect(compatibleActorIds(cycle.actors, actor.actorId).length).toBeGreaterThan(0);
      }
    }
  });

  it("supports an explicitly requested single-cycle capacity run", () => {
    const plan = buildDistributedRunPlan({
      runId: "cap200-one-cycle",
      actors: actors(),
      nodes: nodes(),
      cycles: 1,
    });

    expect(plan.cycles).toBe(1);
    expect(plan.workload.cycles).toHaveLength(1);
    expect(plan.workload.cycles[0].roomHoldMs).toBe(120_000);
  });

  it("keeps ranked cohorts even so every preflight actor can actually form a pair", () => {
    const plan = buildDistributedRunPlan({
      runId: "cap10-even-ranked",
      actors: actors(10),
      nodes: nodes(1),
    });

    for (const cycle of plan.workload.cycles) {
      expect(cycle.actors.filter((actor) => actor.match.mode === "ranked")).toHaveLength(4);
      expect(cycle.actors.filter((actor) => actor.match.mode === "casual")).toHaveLength(6);
    }
  });

  it("passes only when at least 180 distinct actors finish all three cycles and exit", () => {
    const plan = buildDistributedRunPlan({ runId: "cap200-pass", actors: actors(), nodes: nodes() });
    const reports = plan.assignments.map((assignment, nodeIndex) => ({
      nodeId: assignment.nodeId,
      egressId: `egress-${nodeIndex + 1}`,
      fatal: false,
      actors: assignment.actorIds.map((actorId) => ({
        actorId,
        cycles: [1, 2, 3].map((cycle) => ({
          cycle,
          completed: Number(actorId.slice(1)) <= 180,
          exited: Number(actorId.slice(1)) <= 180,
        })),
      })),
    }));

    expect(summarizeDistributedRun({ plan, reports })).toMatchObject({
      status: "PASS",
      completedAllCycles: 180,
      cleanlyExited: 180,
      uniqueEgress: 10,
      multiIpVerified: true,
    });
  });

  it("writes one 0600 credential shard per agent without leaking secrets into job plans", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "jiyuan-capacity-distributed-"));
    const plan = buildDistributedRunPlan({ runId: "cap200-bundles", actors: actors(), nodes: nodes() });
    const credentials = actors().map((actor) => ({ identity: actor.actorId, identifier: `${actor.actorId}@example.invalid`, password: `secret-${actor.actorId}` }));
    try {
      const bundles = await writeAgentBundles({ directory, plan, credentials });
      expect(bundles).toHaveLength(10);
      for (const bundle of bundles) {
        expect((await stat(bundle.credentialsFile)).mode & 0o777).toBe(0o600);
        const job = await readFile(bundle.jobFile, "utf8");
        const shard = JSON.parse(await readFile(bundle.credentialsFile, "utf8"));
        expect(job).not.toMatch(/password|secret-|access_token|refresh_token/i);
        expect(shard.identities).toHaveLength(20);
        expect(shard.identities.map((identity) => identity.identity).sort()).toEqual(bundle.actorIds.toSorted());
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("continues non-fatally when one actor fails and exits every authenticated actor", async () => {
    const plan = buildDistributedRunPlan({ runId: "cap200-agent", actors: actors(), nodes: nodes() });
    const assignment = plan.assignments[0];
    const actorSet = new Set(assignment.actorIds);
    const job = {
      runId: plan.runId,
      nodeId: assignment.nodeId,
      cycles: plan.workload.cycles.map((cycle) => ({ ...cycle, roomHoldMs: 0, actors: cycle.actors.filter((actor) => actorSet.has(actor.actorId)) })),
    };
    const credentials = assignment.actorIds.map((actorId) => ({ identity: actorId, identifier: actorId, password: "only-in-test-driver" }));
    const exited = [];
    const driver = {
      async egressId() { return "egress-test-01"; },
      async authenticate(credential) { return { actorId: credential.identity }; },
      async runCycle(runtime, actor, cycle) {
        if (actor.actorId === assignment.actorIds[0] && cycle === 2) throw new Error("isolated actor failure");
      },
      async exit(runtime) { exited.push(runtime.actorId); },
    };

    const report = await runDistributedAgent({ job, credentials, driver, concurrency: 5 });
    expect(report).toMatchObject({ nodeId: assignment.nodeId, egressId: "egress-test-01", fatal: false, nonFatalErrors: 1 });
    expect(report.actors.filter((actor) => actor.cycles.every((cycle) => cycle.completed))).toHaveLength(19);
    expect(exited.toSorted()).toEqual(assignment.actorIds.toSorted());
  });

  it("starts every actor assigned to a node concurrently by default", async () => {
    const actorIds = actors(6).map((actor) => actor.actorId);
    const job = {
      runId: "cap-node-concurrency",
      nodeId: "node-01",
      cycles: [{
        cycle: 1,
        roomHoldMs: 0,
        actors: actorIds.map((actorId) => ({ actorId, match: { mode: "ranked" } })),
      }],
    };
    const credentials = actorIds.map((actorId) => ({ identity: actorId, identifier: actorId, password: "only-in-test-driver" }));
    let active = 0;
    let maximumActive = 0;
    const driver = {
      async egressId() { return "egress-test-01"; },
      async authenticate(credential) { return { actorId: credential.identity }; },
      async runCycle() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        return { exited: true };
      },
      async exit() {},
    };

    await runDistributedAgent({ job, credentials, driver });
    expect(maximumActive).toBe(6);
  });

  it("paces concentrated password logins in waves before running actors concurrently", async () => {
    const actorIds = actors(3).map((actor) => actor.actorId);
    const job = {
      runId: "cap-auth-waves",
      nodeId: "node-01",
      authStaggerMs: 25,
      cycles: [{
        cycle: 1,
        roomHoldMs: 0,
        actors: actorIds.map((actorId) => ({ actorId, match: { mode: "ranked" } })),
      }],
    };
    const credentials = actorIds.map((actorId) => ({ identity: actorId, identifier: actorId, password: "only-in-test-driver" }));
    const startedAt = [];
    const driver = {
      async egressId() { return "egress-test-01"; },
      async authenticate(credential) {
        startedAt.push({ actorId: credential.identity, at: Date.now() });
        return { actorId: credential.identity };
      },
      async runCycle() { return { exited: true }; },
      async exit() {},
    };

    await runDistributedAgent({ job, credentials, driver });

    expect(startedAt).toHaveLength(3);
    expect(startedAt[1].at - startedAt[0].at).toBeGreaterThanOrEqual(20);
    expect(startedAt[2].at - startedAt[1].at).toBeGreaterThanOrEqual(20);
  });

  it("does not mistake a one-person Room-first shell for a completed match", () => {
    const onePersonShell = { room: { id: "room-1", members: [{ id: "user-1" }], recruiting: true }, session: null };
    const pairedRoom = { room: { id: "room-1", members: [{ id: "user-1" }, { id: "user-2" }] }, session: null };
    const readySession = { room: { id: "room-1", members: [{ id: "user-1" }] }, session: { id: "session-1", status: "ready" } };
    expect(isMatchedRoomState(onePersonShell)).toBe(false);
    expect(isMatchedRoomState(pairedRoom)).toBe(true);
    expect(isMatchedRoomState(readySession)).toBe(true);
  });

  it("uses Realtime plus sparse jittered reconciliation instead of synchronized two-second Room polling", async () => {
    const source = await readFile(new URL("../tools/capacity/production-agent-driver.mjs", import.meta.url), "utf8");
    expect(source).toContain("MATCH_STATE_SAFETY_READ_MS = 12_000");
    expect(source).toContain("runtime.realtime.length !== observedRealtimeEvents");
    expect(source).toContain("isTransientStateReadTimeout(error)");
    expect(source).not.toContain("sleep(2_000 + Math.floor(Math.random() * 250))");
  });
});
