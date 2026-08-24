#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

export const PRODUCTION_HOSTS = new Set(["www.jiyuan.online", "jiyuan.online"]);

export const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

export const READ_ONLY_PATHS = Object.freeze([
  /^\/$/,
  /^\/index\.html$/,
  /^\/api\/health$/,
  /^\/api\/config$/,
  /^\/api\/state$/,
  /^\/api\/session$/,
  /^\/js\/app\.js$/,
  /^\/styles\/product-shell\.css$/,
]);

const STATEFUL_PATHS = Object.freeze([
  /^\/api\/online$/,
  /^\/api\/offline$/,
  /^\/api\/matchmaking\/start$/,
  /^\/api\/matchmaking\/join$/,
  /^\/api\/matchmaking\/status$/,
  /^\/api\/matchmaking\/cancel$/,
  /^\/api\/matchmaking\/confirm$/,
  /^\/api\/matchmaking\/group\/start$/,
  /^\/api\/room\/[^/]+\/(?:goodbye|exit|feedback)$/,
  /^\/api\/events$/,
]);

const SECRET_TEXT = /service[_-]?role|supabase_service_role|private\s+key|database\s+password|secret_key/i;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const TOKEN_ENV = /^CAPACITY_[A-Z0-9_]+_TOKEN$/;

export const DEFAULT_OPTIONS = Object.freeze({
  mode: "dry-run",
  baseUrl: "http://127.0.0.1:3000",
  baseUrlExplicit: false,
  runId: "",
  maxUsers: 0,
  maxRps: 10,
  maxRequests: 0,
  durationSec: 60,
  requestTimeoutMs: 10_000,
  abortOn5xx: true,
  abortOnTimeout: true,
  abortOn429: true,
  allowProduction: false,
  productionAck: "",
  statefulApproval: "",
  manifest: "",
  scenario: "",
  evidenceDir: "",
  killSwitchFile: "",
});

function usageError(message) {
  throw new Error(`CAPACITY_RUNNER_USAGE: ${message}`);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) usageError(`${flag} requires a value`);
  return value;
}

function integer(value, flag, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value)) usageError(`${flag} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    usageError(`${flag} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function parseArgs(argv = []) {
  const options = { ...DEFAULT_OPTIONS };
  let dryRunExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") {
      options.mode = "dry-run";
      dryRunExplicit = true;
    } else if (flag === "--execute-read-only") {
      options.mode = "read-only";
    } else if (flag === "--stateful") {
      options.mode = "stateful";
    } else if (flag === "--allow-production") {
      options.allowProduction = true;
    } else if (flag === "--run-id") {
      options.runId = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--base-url") {
      options.baseUrl = takeValue(argv, index, flag);
      options.baseUrlExplicit = true;
      index += 1;
    } else if (flag === "--production-ack") {
      options.productionAck = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--stateful-approval") {
      options.statefulApproval = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--max-users") {
      options.maxUsers = integer(takeValue(argv, index, flag), flag, { max: 100 });
      index += 1;
    } else if (flag === "--max-rps") {
      options.maxRps = integer(takeValue(argv, index, flag), flag, { min: 1, max: 30 });
      index += 1;
    } else if (flag === "--max-requests") {
      options.maxRequests = integer(takeValue(argv, index, flag), flag, { max: 10_000 });
      index += 1;
    } else if (flag === "--duration") {
      options.durationSec = integer(takeValue(argv, index, flag), flag, { min: 1, max: 900 });
      index += 1;
    } else if (flag === "--request-timeout-ms") {
      options.requestTimeoutMs = integer(takeValue(argv, index, flag), flag, { min: 100, max: 10_000 });
      index += 1;
    } else if (flag === "--manifest") {
      options.manifest = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--scenario") {
      options.scenario = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--evidence-dir") {
      options.evidenceDir = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--kill-switch-file") {
      options.killSwitchFile = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--abort-on-5xx" || flag === "--abort-on-timeout" || flag === "--abort-on-429") {
      // These flags are intentionally explicit in run manifests. The runner
      // never exposes a flag that disables an emergency stop.
    } else if (flag === "--help") {
      options.help = true;
    } else {
      usageError(`unknown flag ${flag}`);
    }
  }

  if (options.help) return options;
  if (!options.runId) usageError("--run-id is required");
  if (!RUN_ID.test(options.runId)) usageError("--run-id contains unsafe characters");
  if (dryRunExplicit && options.mode !== "dry-run") usageError("--dry-run cannot be combined with an execution mode");
  if (options.mode !== "dry-run" && !options.baseUrlExplicit) usageError("--base-url is required for execution");
  if (options.mode === "dry-run") return options;
  if (options.maxUsers < 1) usageError("--max-users must be greater than zero for execution");
  if (options.maxRequests < 1) usageError("--max-requests must be greater than zero for execution");
  if (!options.manifest) usageError("--manifest is required for execution");

  const target = new URL(options.baseUrl);
  if (PRODUCTION_HOSTS.has(target.hostname)) {
    if (!options.allowProduction) usageError("Production target requires --allow-production");
    if (options.productionAck !== options.runId) {
      usageError("Production target requires --production-ack equal to --run-id");
    }
  }

  if (options.mode === "read-only" && options.maxRequests > 600) {
    usageError("read-only burst is capped at 600 requests");
  }
  if (options.mode === "stateful" && options.statefulApproval !== options.runId) {
    usageError("stateful mode requires --stateful-approval equal to --run-id");
  }
  return options;
}

export function isProductionUrl(baseUrl) {
  return PRODUCTION_HOSTS.has(new URL(baseUrl).hostname);
}

export function normalizePath(value) {
  const url = new URL(value, "http://capacity.invalid");
  return `${url.pathname}${url.search}`;
}

function pathMatches(pathname, patterns) {
  return patterns.some((pattern) => pattern.test(pathname));
}

export function assertSafeOperation({ mode, method, path: requestPath }) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = normalizePath(requestPath);
  const pathname = new URL(normalizedPath, "http://capacity.invalid").pathname;

  if (mode === "dry-run") {
    throw new Error("CAPACITY_RUNNER_SAFETY: dry-run cannot execute network operations");
  }
  if (mode === "read-only") {
    if (!READ_ONLY_METHODS.has(normalizedMethod)) {
      throw new Error(`CAPACITY_RUNNER_SAFETY: ${normalizedMethod} is forbidden in read-only mode`);
    }
    if (!pathMatches(pathname, READ_ONLY_PATHS)) {
      throw new Error(`CAPACITY_RUNNER_SAFETY: path is not allowlisted for read-only mode: ${pathname}`);
    }
    return { method: normalizedMethod, path: normalizedPath, mutation: false };
  }
  if (mode === "stateful") {
    if (!["GET", "POST"].includes(normalizedMethod)) {
      throw new Error(`CAPACITY_RUNNER_SAFETY: ${normalizedMethod} is not allowed in stateful mode`);
    }
    if (normalizedMethod === "GET" && !pathMatches(pathname, READ_ONLY_PATHS)) {
      throw new Error(`CAPACITY_RUNNER_SAFETY: stateful GET path is not allowlisted: ${pathname}`);
    }
    if (normalizedMethod === "POST" && !pathMatches(pathname, STATEFUL_PATHS)) {
      throw new Error(`CAPACITY_RUNNER_SAFETY: stateful POST path is not allowlisted: ${pathname}`);
    }
    return { method: normalizedMethod, path: normalizedPath, mutation: normalizedMethod === "POST" };
  }
  throw new Error(`CAPACITY_RUNNER_SAFETY: unknown mode ${mode}`);
}

function assertNoSecretText(value, source = "input") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (SECRET_TEXT.test(text)) {
    throw new Error(`CAPACITY_RUNNER_SAFETY: possible privileged secret in ${source}`);
  }
}

export async function loadManifest(file) {
  const raw = await readFile(file, "utf8");
  assertNoSecretText(raw, "manifest");
  const manifest = JSON.parse(raw);
  if (!manifest || !Array.isArray(manifest.actors)) {
    throw new Error("CAPACITY_MANIFEST: actors[] is required");
  }
  const seen = new Set();
  const actors = manifest.actors.map((actor, index) => {
    if (!actor || typeof actor !== "object") throw new Error(`CAPACITY_MANIFEST: actor ${index} is invalid`);
    const actorId = String(actor.actor_id || actor.actorId || "");
    if (!RUN_ID.test(actorId)) throw new Error(`CAPACITY_MANIFEST: actor ${index} has an invalid actor_id`);
    if (seen.has(actorId)) throw new Error(`CAPACITY_MANIFEST: duplicate actor_id ${actorId}`);
    seen.add(actorId);
    if (actor.access_token || actor.accessToken || actor.password) {
      throw new Error("CAPACITY_MANIFEST: credentials must be supplied through token_env, never stored in manifest");
    }
    const tokenEnv = actor.token_env || actor.tokenEnv || "";
    if (tokenEnv && !TOKEN_ENV.test(tokenEnv)) {
      throw new Error(`CAPACITY_MANIFEST: unsafe token_env for ${actorId}`);
    }
    return {
      actorId,
      userId: actor.user_id || actor.userId || "UNKNOWN",
      mode: actor.mode || "UNKNOWN",
      tokenEnv,
      profile: actor.profile || "UNKNOWN",
    };
  });
  if (actors.length > 100) throw new Error("CAPACITY_MANIFEST: maximum 100 actors");
  return { ...manifest, actors };
}

export function buildReadOnlyPlan({ actors, maxUsers, maxRequests, runId }) {
  const selected = actors.slice(0, maxUsers);
  if (selected.length === 0) throw new Error("CAPACITY_PLAN: no actors selected");
  const requests = [];
  for (const actor of selected) {
    requests.push({ actorId: actor.actorId, path: "/", authenticated: false });
    requests.push({ actorId: actor.actorId, path: "/api/config", authenticated: false });
    requests.push({ actorId: actor.actorId, path: "/api/state", authenticated: true });
    requests.push({ actorId: actor.actorId, path: "/api/session", authenticated: true });
    requests.push({ actorId: actor.actorId, path: "/js/app.js", authenticated: false });
  }
  // Static CSS and health checks are shared samples, not extra requests
  // assigned to a synthetic reader. This keeps every reader at five
  // requests (and below the six-request safety limit).
  const staticSamples = Math.max(1, Math.floor(selected.length / 10));
  for (let index = 0; index < staticSamples; index += 1) {
    requests.push({ actorId: "__shared__", path: "/styles/product-shell.css", authenticated: false });
  }
  const healthCount = Math.max(1, Math.floor(selected.length / 10));
  for (let index = 0; index < healthCount; index += 1) {
    requests.push({ actorId: "__shared__", path: "/api/health", authenticated: false });
  }
  if (requests.length > maxRequests) {
    throw new Error(`CAPACITY_PLAN: ${requests.length} planned requests exceed --max-requests=${maxRequests}`);
  }
  const healthRequests = requests.filter((request) => request.path === "/api/health").length;
  if (healthRequests / requests.length > 0.1) {
    throw new Error("CAPACITY_PLAN: /api/health exceeds the 10% request budget");
  }
  return {
    runId,
    mode: "read-only",
    maxUsers: selected.length,
    maxRequests,
    requests,
    healthRequests,
    healthRatio: healthRequests / requests.length,
    perActorMaximum: Math.max(...selected.map((actor) => requests.filter((request) => request.actorId === actor.actorId).length)),
  };
}

function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return Number(sorted[lower].toFixed(2));
  return Number((sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)).toFixed(2));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeError(error) {
  return String(error?.message || error || "unknown error")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access[_-]?token|refresh[_-]?token|password|secret)[=:][^\s,}]+/gi, "$1=[REDACTED]");
}

function captureResourceSnapshot() {
  return {
    at: new Date().toISOString(),
    pid: process.pid,
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    loadAverage: os.loadavg(),
    uptimeSec: process.uptime(),
  };
}

function createKillSwitch({ file, rootController }) {
  let killed = false;
  const onSignal = () => {
    killed = true;
    rootController.abort(new Error("global kill switch signal received"));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  return {
    isKilled() {
      if (killed) return true;
      if (file && existsSync(file)) {
        killed = true;
        rootController.abort(new Error("global kill switch file detected"));
      }
      return killed;
    },
    cleanup() {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    },
  };
}

async function requestWithTimeout({ baseUrl, request, actor, options, rootSignal }) {
  const operation = assertSafeOperation({ mode: options.mode, method: "GET", path: request.path });
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRoot = () => controller.abort(rootSignal.reason);
  rootSignal.addEventListener("abort", abortFromRoot, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("request timeout"));
  }, options.requestTimeoutMs);
  const started = performance.now();
  const headers = {
    Accept: "*/*",
    "User-Agent": `jiyuan-capacity/${options.runId}`,
    "X-Capacity-Run-Id": options.runId,
  };
  if (request.authenticated) {
    const token = actor?.tokenEnv ? process.env[actor.tokenEnv] : "";
    if (!token) throw new Error(`CAPACITY_MANIFEST: missing token env for ${actor?.actorId || request.actorId}`);
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(new URL(operation.path, baseUrl), {
      method: operation.method,
      headers,
      signal: controller.signal,
    });
    await response.arrayBuffer();
    const durationMs = Number((performance.now() - started).toFixed(2));
    const result = {
      at: new Date().toISOString(),
      actorId: request.actorId,
      path: operation.path,
      method: operation.method,
      status: response.status,
      durationMs,
      authenticated: request.authenticated,
      errorClass: response.status >= 500 ? "5xx" : response.status === 429 ? "429" : response.status >= 400 ? "4xx" : null,
    };
    if (result.errorClass === "5xx" && options.abortOn5xx) throw Object.assign(new Error("5xx response"), { result });
    if (result.errorClass === "429" && options.abortOn429) throw Object.assign(new Error("429 response"), { result });
    if (result.errorClass === "4xx") throw Object.assign(new Error("unexpected 4xx response"), { result });
    return result;
  } catch (error) {
    if (timedOut) {
      const result = { at: new Date().toISOString(), actorId: request.actorId, path: request.path, method: "GET", status: null, durationMs: Number((performance.now() - started).toFixed(2)), authenticated: request.authenticated, errorClass: "timeout" };
      if (options.abortOnTimeout) throw Object.assign(new Error("request timeout"), { result });
      return result;
    }
    if (error?.result) throw error;
    throw Object.assign(new Error(safeError(error)), { result: { at: new Date().toISOString(), actorId: request.actorId, path: request.path, method: "GET", status: null, durationMs: Number((performance.now() - started).toFixed(2)), authenticated: request.authenticated, errorClass: "network" } });
  } finally {
    clearTimeout(timeout);
    rootSignal.removeEventListener("abort", abortFromRoot);
  }
}

function summarizeResults(results, { aborted = false, abortReason = null } = {}) {
  const durations = results.filter((result) => Number.isFinite(result.durationMs)).map((result) => result.durationMs);
  const count = (errorClass) => results.filter((result) => result.errorClass === errorClass).length;
  return {
    total: results.length,
    success: results.filter((result) => !result.errorClass).length,
    five_xx: count("5xx"),
    four_xx: count("4xx"),
    rate_limited: count("429"),
    timeout: count("timeout"),
    network_error: count("network"),
    p50Ms: quantile(durations, 0.5),
    p95Ms: quantile(durations, 0.95),
    p99Ms: quantile(durations, 0.99),
    aborted,
    abortReason,
  };
}

export async function runReadOnlyBurst({ options, manifest, plan }) {
  if (options.mode !== "read-only") throw new Error("CAPACITY_RUNNER: read-only execution requires --execute-read-only");
  const selectedActors = new Map(manifest.actors.map((actor) => [actor.actorId, actor]));
  const rootController = new AbortController();
  const killSwitch = createKillSwitch({ file: options.killSwitchFile, rootController });
  const results = [];
  const startedAt = new Date().toISOString();
  // Jitter only the start of the run. Per-request jitter can shorten the
  // interval between adjacent requests and violate the configured RPS cap.
  const start = performance.now() + Math.random() * Math.min(1000, (1000 / options.maxRps) * 10);
  const intervalMs = 1000 / options.maxRps;
  let aborted = false;
  let abortReason = null;
  const tasks = plan.requests.map((request, index) => (async () => {
    const scheduledAt = start + index * intervalMs;
    await sleep(Math.max(0, scheduledAt - performance.now()));
    if (killSwitch.isKilled() || rootController.signal.aborted) return;
    if ((performance.now() - start) / 1000 > options.durationSec) {
      aborted = true;
      abortReason = "duration limit";
      rootController.abort(new Error(abortReason));
      return;
    }
    const actor = selectedActors.get(request.actorId);
    try {
      results.push(await requestWithTimeout({ baseUrl: options.baseUrl, request, actor, options, rootSignal: rootController.signal }));
    } catch (error) {
      if (error?.result) results.push(error.result);
      aborted = true;
      abortReason = safeError(error);
      rootController.abort(error);
    }
  })());
  await Promise.all(tasks);
  if (killSwitch.isKilled()) {
    aborted = true;
    abortReason ||= "kill switch";
  }
  killSwitch.cleanup();
  return {
    runId: options.runId,
    mode: options.mode,
    baseUrl: options.baseUrl,
    startedAt,
    endedAt: new Date().toISOString(),
    resourceBefore: captureResourceSnapshot(),
    resourceAfter: captureResourceSnapshot(),
    metrics: summarizeResults(results, { aborted, abortReason }),
    results,
  };
}

export function dryRunPlan({ options, manifest = { actors: [] } }) {
  return {
    runId: options.runId,
    mode: "dry-run",
    networkExecuted: false,
    productionTarget: options.baseUrlExplicit && isProductionUrl(options.baseUrl),
    maxUsers: options.maxUsers,
    maxRps: options.maxRps,
    maxRequests: options.maxRequests,
    durationSec: options.durationSec,
    readOnlyPaths: READ_ONLY_PATHS.map((pattern) => pattern.toString()),
    actorSlots: manifest.actors.length,
    statefulExecution: "guarded scaffold only; Realtime/lifecycle adapter not implemented",
  };
}

export async function writeEvidence({ directory, manifest, plan, result }) {
  await mkdir(directory, { recursive: true });
  const safeManifest = {
    run_id: manifest.run_id || result?.runId || "UNKNOWN",
    release_candidate: manifest.release_candidate || "UNKNOWN",
    actors: manifest.actors.map(({ actorId, userId, mode, profile }) => ({ actor_id: actorId, user_id: userId, mode, profile })),
  };
  await writeFile(path.join(directory, "run-manifest.json"), `${JSON.stringify(safeManifest, null, 2)}\n`);
  await writeFile(path.join(directory, "api-metrics.json"), `${JSON.stringify(result?.metrics || { status: "NOT_EXECUTED" }, null, 2)}\n`);
  await writeFile(path.join(directory, "resource-metrics.json"), `${JSON.stringify({ before: result?.resourceBefore || null, after: result?.resourceAfter || null }, null, 2)}\n`);
  await writeFile(path.join(directory, "actor-events.ndjson"), `${(result?.results || []).map((event) => JSON.stringify(event)).join("\n")}\n`);
  await writeFile(path.join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
}

export function helpText() {
  return `Usage:\n  pnpm capacity:run -- --dry-run --run-id <id>\n  pnpm capacity:run -- --execute-read-only --base-url <url> --run-id <id> --manifest <file> --max-users <n> --max-rps <n> --max-requests <n> --allow-production --production-ack <id>\n\nSafety:\n  dry-run is the default and performs no network request. Read-only execution only permits GET/HEAD on the fixed allowlist. Production execution requires --allow-production and --production-ack=<run-id>. Stateful mode additionally requires --stateful-approval=<run-id> and currently stops before mutation because the lifecycle/Realtime adapter is not implemented.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const manifest = options.manifest ? await loadManifest(options.manifest) : { actors: [] };
  if (options.mode === "dry-run") {
    console.log(JSON.stringify(dryRunPlan({ options, manifest }), null, 2));
    return;
  }
  if (options.mode === "stateful") {
    throw new Error("CAPACITY_RUNNER_NOT_READY: stateful lifecycle and Realtime adapter is not implemented; no request was sent");
  }
  const plan = buildReadOnlyPlan({ actors: manifest.actors, maxUsers: options.maxUsers, maxRequests: options.maxRequests, runId: options.runId });
  const result = await runReadOnlyBurst({ options, manifest, plan });
  const directory = options.evidenceDir || path.join(process.cwd(), "output", "capacity-validation", options.runId);
  await writeEvidence({ directory, manifest, plan, result });
  console.log(JSON.stringify({ ...result, evidenceDir: directory }, null, 2));
  if (result.metrics.aborted || result.metrics.five_xx || result.metrics.timeout || result.metrics.rate_limited) process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
