import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SECRET_KEY = /^(?:password|access[_-]?token|refresh[_-]?token|authorization)$/i;

function assertNoSecretMaterial(value, pathLabel = "job") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretMaterial(item, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /Bearer\s+\S+/i.test(value)) {
      throw new Error(`CAPACITY_DISTRIBUTED: ${pathLabel} contains secret material`);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`CAPACITY_DISTRIBUTED: ${pathLabel}.${key} contains secret material`);
    if (/service[_-]?role/i.test(key) && item !== false && item !== null) {
      throw new Error(`CAPACITY_DISTRIBUTED: ${pathLabel}.${key} contains privileged material`);
    }
    assertNoSecretMaterial(item, `${pathLabel}.${key}`);
  }
}

function safeJson(value, label) {
  assertNoSecretMaterial(value, label);
  const serialized = JSON.stringify(value, null, 2);
  return `${serialized}\n`;
}

export async function writeAgentBundles({ directory, plan, credentials } = {}) {
  if (!directory || !plan || !Array.isArray(credentials)) {
    throw new Error("CAPACITY_DISTRIBUTED: directory, plan, and credentials are required");
  }
  const credentialsByActor = new Map(credentials.map((credential) => [credential.identity, credential]));
  if (credentialsByActor.size !== plan.users) {
    throw new Error(`CAPACITY_DISTRIBUTED: expected ${plan.users} distinct credentials`);
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const bundles = [];
  for (const assignment of plan.assignments) {
    const nodeDirectory = path.join(directory, assignment.nodeId);
    await mkdir(nodeDirectory, { recursive: true, mode: 0o700 });
    const identities = assignment.actorIds.map((actorId) => {
      const credential = credentialsByActor.get(actorId);
      if (!credential?.identifier || !credential?.password) {
        throw new Error(`CAPACITY_DISTRIBUTED: missing credential for ${actorId}`);
      }
      return {
        identity: actorId,
        identifier: String(credential.identifier),
        password: String(credential.password),
      };
    });
    const job = buildAgentJob({ plan, nodeId: assignment.nodeId });
    const jobFile = path.join(nodeDirectory, "job.json");
    const credentialsFile = path.join(nodeDirectory, "credentials.json");
    await writeFile(jobFile, safeJson(job, "agent job"), { mode: 0o600 });
    await writeFile(credentialsFile, `${JSON.stringify({ identities })}\n`, { mode: 0o600 });
    bundles.push({
      nodeId: assignment.nodeId,
      actorIds: [...assignment.actorIds],
      directory: nodeDirectory,
      jobFile,
      credentialsFile,
    });
  }
  return bundles;
}

export function buildAgentJob({ plan, nodeId } = {}) {
  const assignment = plan?.assignments?.find((candidate) => candidate.nodeId === nodeId);
  if (!assignment) throw new Error(`CAPACITY_DISTRIBUTED: unknown agent ${nodeId}`);
  const actorSet = new Set(assignment.actorIds);
  return {
    schemaVersion: plan.schemaVersion,
    runId: plan.runId,
    nodeId: assignment.nodeId,
    users: assignment.actorIds.length,
    authStartAt: plan.authStartAt,
    authStaggerMs: plan.authStaggerMs,
    cycles: plan.workload.cycles.map((cycle) => ({
      cycle: cycle.cycle,
      startAt: cycle.startAt,
      roomHoldMs: cycle.roomHoldMs,
      actors: cycle.actors.filter((actor) => actorSet.has(actor.actorId)),
    })),
    safety: plan.safety,
  };
}
