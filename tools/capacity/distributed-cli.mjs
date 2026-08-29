#!/usr/bin/env node
import { chmod, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDistributedRunPlan, summarizeDistributedRun } from "./distributed-plan.mjs";
import { buildAgentJob, writeAgentBundles } from "./distributed-bundles.mjs";
import { runDistributedAgent } from "./distributed-agent.mjs";
import { createProductionAgentDriver } from "./production-agent-driver.mjs";
import { loadCapacityGame } from "./game-catalog.mjs";
import { loadManifest, readStatefulCredentialsFile } from "./runner.mjs";

function usage(message = "") {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(`Usage:
  distributed-cli.mjs prepare --base-url <url> --run-id <id> --manifest <safe.json> --credentials <0600.json> --users <10|200> --nodes <1|7..10> --start-at <ISO> [--output <dir>]
  distributed-cli.mjs plan --base-url <url> --run-id <id> --manifest <safe.json> --users <10|200> --nodes <1|7..10> --cycles <1|3> --start-at <ISO> --output <plan.json>
  distributed-cli.mjs job --plan <plan.json> --node-id <node-01> --output <job.json>
  distributed-cli.mjs agent --job <job.json> --credentials <0600.json> --base-url <url> --report <report.json> --allow-production --production-ack <run-id>
  distributed-cli.mjs summarize --plan <plan.json> --reports <dir> --output <summary.json>
`);
  process.exitCode = 2;
}

function parse(argv) {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...rest] = normalized;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--")) throw new Error(`unexpected argument ${flag}`);
    const key = flag.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    if (key === "allowProduction") {
      options[key] = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writePrivateJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function prepare(options) {
  if (!options.baseUrl || !options.runId || !options.manifest || !options.credentials || !options.startAt) throw new Error("prepare requires base URL, run id, manifest, credentials, and start time");
  const users = Number(options.users || 200);
  const nodeCount = Number(options.nodes || (users === 200 ? 10 : 1));
  const cycles = Number(options.cycles || 3);
  if (!Number.isInteger(users) || !Number.isInteger(nodeCount)) throw new Error("users and nodes must be integers");
  const startAt = new Date(options.startAt);
  if (!Number.isFinite(startAt.getTime()) || startAt.getTime() < Date.now() + 60_000) throw new Error("start time must be a valid future time");
  const manifest = await loadManifest(options.manifest);
  const actors = manifest.actors.slice(0, users).map((actor) => ({ actorId: actor.actorId, userId: actor.userId, profile: actor.profile || "synthetic_test" }));
  if (actors.length !== users) throw new Error(`manifest contains only ${actors.length} actors`);
  const credentials = await readStatefulCredentialsFile(options.credentials);
  const credentialIds = new Set(credentials.map((credential) => credential.identity));
  for (const actor of actors) if (!credentialIds.has(actor.actorId)) throw new Error(`missing credential for ${actor.actorId}`);
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ nodeId: `node-${String(index + 1).padStart(2, "0")}` }));
  const game = await loadCapacityGame(options.baseUrl, options.gameId);
  const plan = buildDistributedRunPlan({ runId: options.runId, actors, nodes, cycles, startAt: startAt.toISOString(), game });
  const directory = options.output || path.join(os.tmpdir(), `jiyuan-capacity-${options.runId}`);
  const planFile = path.join(directory, "plan.json");
  await writePrivateJson(planFile, plan);
  const bundles = await writeAgentBundles({ directory: path.join(directory, "agent-bundles"), plan, credentials });
  credentials.forEach((credential) => { credential.password = ""; });
  process.stdout.write(`${JSON.stringify({ runId: plan.runId, users: plan.users, nodes: bundles.length, authStartAt: plan.authStartAt, planFile, bundleDirectory: path.join(directory, "agent-bundles") }, null, 2)}\n`);
}

async function createPlanCommand(options) {
  if (!options.baseUrl || !options.runId || !options.manifest || !options.startAt || !options.output) throw new Error("plan requires base URL, run id, manifest, start time, and output");
  const users = Number(options.users || 200);
  const nodeCount = Number(options.nodes || (users === 200 ? 10 : 1));
  const cycles = Number(options.cycles || 3);
  const startAt = new Date(options.startAt);
  if (!Number.isFinite(startAt.getTime()) || startAt.getTime() < Date.now() + 60_000) throw new Error("start time must be a valid future time");
  const manifest = await loadManifest(options.manifest);
  const actors = manifest.actors.slice(0, users).map((actor) => ({ actorId: actor.actorId, userId: actor.userId, profile: actor.profile || "synthetic_test" }));
  if (actors.length !== users) throw new Error(`manifest contains only ${actors.length} actors`);
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ nodeId: `node-${String(index + 1).padStart(2, "0")}` }));
  const game = await loadCapacityGame(options.baseUrl, options.gameId);
  const plan = buildDistributedRunPlan({ runId: options.runId, actors, nodes, cycles, startAt: startAt.toISOString(), game });
  await writePrivateJson(options.output, plan);
  process.stdout.write(`${JSON.stringify({ runId: plan.runId, users: plan.users, nodes: plan.assignments.length, plan: options.output })}\n`);
}

async function createJobCommand(options) {
  if (!options.plan || !options.nodeId || !options.output) throw new Error("job requires plan, node id, and output");
  const plan = await readJson(options.plan);
  const job = buildAgentJob({ plan, nodeId: options.nodeId });
  await writePrivateJson(options.output, job);
  process.stdout.write(`${JSON.stringify({ runId: job.runId, nodeId: job.nodeId, users: job.users, job: options.output })}\n`);
}

function assertProductionApproval(options, job) {
  const target = new URL(options.baseUrl);
  if (["jiyuan.online", "www.jiyuan.online"].includes(target.hostname)) {
    if (!options.allowProduction || options.productionAck !== job.runId) {
      throw new Error("Production agent requires --allow-production and --production-ack equal to the run id");
    }
  }
}

async function agent(options) {
  if (!options.job || !options.credentials || !options.baseUrl || !options.report) throw new Error("agent requires job, credentials, base URL, and report path");
  const job = await readJson(options.job);
  assertProductionApproval(options, job);
  const credentials = await readStatefulCredentialsFile(options.credentials);
  const driver = await createProductionAgentDriver({
    baseUrl: options.baseUrl,
    runId: job.runId,
    evidenceDirectory: path.join(path.dirname(options.report), "evidence"),
  });
  try {
    const report = await runDistributedAgent({ job, credentials, driver });
    await writePrivateJson(options.report, report);
    process.stdout.write(`${JSON.stringify({ nodeId: report.nodeId, fatal: report.fatal, nonFatalErrors: report.nonFatalErrors, report: options.report })}\n`);
  } finally {
    credentials.forEach((credential) => { credential.password = ""; });
    await driver.close();
    await unlink(options.credentials).catch(() => {});
  }
}

async function summarize(options) {
  if (!options.plan || !options.reports || !options.output) throw new Error("summarize requires plan, reports directory, and output path");
  const plan = await readJson(options.plan);
  const entries = await readdir(options.reports, { withFileTypes: true });
  const reports = [];
  for (const entry of entries) {
    const candidate = entry.isDirectory() ? path.join(options.reports, entry.name, "report.json") : path.join(options.reports, entry.name);
    if (!candidate.endsWith(".json")) continue;
    try {
      if ((await stat(candidate)).isFile()) reports.push(await readJson(candidate));
    } catch {
      // Missing node reports remain missing and therefore cannot count as completed actors.
    }
  }
  const summary = summarizeDistributedRun({ plan, reports });
  await writePrivateJson(options.output, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

async function main() {
  let options;
  try {
    options = parse(process.argv.slice(2));
    if (options.command === "prepare") return await prepare(options);
    if (options.command === "plan") return await createPlanCommand(options);
    if (options.command === "job") return await createJobCommand(options);
    if (options.command === "agent") return await agent(options);
    if (options.command === "summarize") return await summarize(options);
    usage();
  } catch (error) {
    usage(String(error?.message || error));
  }
}

await main();
