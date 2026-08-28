#!/usr/bin/env node

import { chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { buildActionEvent, CapacityTimeoutError, timeoutError, withTimeout } from "./evidence.mjs";

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

export const STATEFUL_PATHS = Object.freeze([
  /^\/api\/auth\/login$/,
  /^\/api\/online$/,
  /^\/api\/offline$/,
  /^\/api\/matchmaking\/start$/,
  /^\/api\/matchmaking\/join$/,
  /^\/api\/matchmaking\/status$/,
  /^\/api\/matchmaking\/cancel$/,
  /^\/api\/matchmaking\/confirm$/,
  /^\/api\/matchmaking\/group\/start$/,
  /^\/api\/room\/[^/]+\/(?:goodbye|exit|feedback|messages|recruitment|slip)$/,
  /^\/api\/events$/,
]);

const SECRET_TEXT = /service[_-]?role|supabase_service_role|private\s+key|database\s+password|secret_key/i;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const AUTH_IDENTITIES = Object.freeze(["A", "B", "C"]);
export const STATEFUL_MAX_USERS = 500;

export const DEFAULT_OPTIONS = Object.freeze({
  mode: "dry-run",
  baseUrl: "http://127.0.0.1:3000",
  baseUrlExplicit: false,
  runId: "",
  maxUsers: 0,
  stages: null,
  maxRps: 10,
  maxRequests: 0,
  durationSec: 60,
  requestTimeoutMs: 10_000,
  authDelayMs: 10_000,
  stateReadConcurrency: 8,
  realtimeConcurrency: 8,
  abortOn5xx: true,
  abortOnTimeout: true,
  abortOn429: true,
  allowProduction: false,
  productionAck: "",
  statefulApproval: "",
  manifest: "",
  manifestOut: "",
  authSecretFile: "",
  authStdin: false,
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
    } else if (flag === "--prepare-auth") {
      options.mode = "auth-prepare";
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
      options.maxUsers = integer(takeValue(argv, index, flag), flag, { max: STATEFUL_MAX_USERS });
      index += 1;
    } else if (flag === "--stages") {
      const rawStages = takeValue(argv, index, flag);
      const stages = rawStages.split(",").map((value) => integer(value.trim(), flag, { min: 5, max: STATEFUL_MAX_USERS }));
      if (!stages.length || new Set(stages).size !== stages.length) usageError(`${flag} must contain distinct stage sizes`);
      options.stages = stages;
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
    } else if (flag === "--auth-delay-ms") {
      options.authDelayMs = integer(takeValue(argv, index, flag), flag, { min: 1_000, max: 60_000 });
      index += 1;
    } else if (flag === "--manifest") {
      options.manifest = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--manifest-out") {
      options.manifestOut = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--auth-secret-file") {
      options.authSecretFile = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === "--auth-stdin") {
      options.authStdin = true;
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
  if (options.authSecretFile && options.authStdin) usageError("--auth-secret-file and --auth-stdin cannot be combined");
  if (options.mode !== "auth-prepare" && options.maxUsers < 1) usageError("--max-users must be greater than zero for execution");
  if (options.mode !== "auth-prepare" && options.maxRequests < 1) usageError("--max-requests must be greater than zero for execution");
  if (options.mode !== "auth-prepare" && !options.manifest) usageError("--manifest is required for execution");

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
  if (options.mode === "auth-prepare") {
    if (!options.manifestOut) usageError("--manifest-out is required for --prepare-auth");
    if (!options.authSecretFile && !options.authStdin) usageError("--prepare-auth requires --auth-secret-file or --auth-stdin");
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

function assertNoCredentialFields(value, source = "input") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/(?:\"|')?(?:password|access_token|accessToken|refresh_token|refreshToken|service_role)(?:\"|')?\s*:/i.test(text)) {
    throw new Error(`CAPACITY_RUNNER_SAFETY: credentials are not allowed in ${source}`);
  }
}

function normalizeCredentialRecord(record, index) {
  if (!record || typeof record !== "object") throw new Error(`CAPACITY_AUTH: identity ${index + 1} is invalid`);
  const identity = String(record.identity || record.id || AUTH_IDENTITIES[index] || "").trim().toUpperCase();
  const identifier = String(record.identifier || record.username || record.email || "").trim();
  const password = String(record.password || "");
  if (!AUTH_IDENTITIES.includes(identity)) throw new Error(`CAPACITY_AUTH: identity ${index + 1} must be A, B, or C`);
  if (!identifier) throw new Error(`CAPACITY_AUTH: identity ${identity} is missing an identifier`);
  if (!password) throw new Error(`CAPACITY_AUTH: identity ${identity} is missing a password`);
  return { identity, identifier, password };
}

export function normalizeCredentials(value) {
  const records = Array.isArray(value) ? value : value?.identities;
  if (!Array.isArray(records) || records.length !== AUTH_IDENTITIES.length) {
    throw new Error("CAPACITY_AUTH: exactly three identities A/B/C are required");
  }
  const credentials = records.map(normalizeCredentialRecord);
  const identities = new Set(credentials.map((record) => record.identity));
  if (identities.size !== AUTH_IDENTITIES.length || AUTH_IDENTITIES.some((identity) => !identities.has(identity))) {
    throw new Error("CAPACITY_AUTH: identities must be distinct A, B, and C");
  }
  return credentials.sort((left, right) => AUTH_IDENTITIES.indexOf(left.identity) - AUTH_IDENTITIES.indexOf(right.identity));
}

export async function readCredentialsFile(file) {
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new Error("CAPACITY_AUTH: secret path is not a file");
  if ((fileStat.mode & 0o777) !== 0o600) throw new Error("CAPACITY_AUTH: secret file must have mode 0600");
  const buffer = await readFile(file);
  try {
    return normalizeCredentials(JSON.parse(buffer.toString("utf8")));
  } catch (error) {
    if (error?.message?.startsWith("CAPACITY_AUTH:")) throw error;
    throw new Error("CAPACITY_AUTH: secret file must contain valid JSON credentials");
  } finally {
    buffer.fill(0);
  }
}

export function normalizeStatefulCredentials(value) {
  const records = Array.isArray(value) ? value : value?.identities;
  if (!Array.isArray(records) || records.length < 5 || records.length > STATEFUL_MAX_USERS) {
    throw new Error(`CAPACITY_AUTH: stateful rehearsal requires 5 to ${STATEFUL_MAX_USERS} identities`);
  }
  const seen = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== "object") throw new Error(`CAPACITY_AUTH: stateful identity ${index + 1} is invalid`);
    const identity = String(record.identity || record.id || "").trim();
    const identifier = String(record.identifier || record.username || record.email || "").trim();
    const password = String(record.password || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/.test(identity)) {
      throw new Error(`CAPACITY_AUTH: stateful identity ${index + 1} has an invalid identity`);
    }
    if (!identifier || !password) throw new Error(`CAPACITY_AUTH: stateful identity ${identity || index + 1} is incomplete`);
    if (seen.has(identity)) throw new Error(`CAPACITY_AUTH: duplicate stateful identity ${identity}`);
    seen.add(identity);
    return { identity, identifier, password };
  });
}

export async function readStatefulCredentialsFile(file) {
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new Error("CAPACITY_AUTH: stateful secret path is not a file");
  if ((fileStat.mode & 0o777) !== 0o600) throw new Error("CAPACITY_AUTH: stateful secret file must have mode 0600");
  const buffer = await readFile(file);
  try {
    return normalizeStatefulCredentials(JSON.parse(buffer.toString("utf8")));
  } catch (error) {
    if (error?.message?.startsWith("CAPACITY_AUTH:")) throw error;
    throw new Error("CAPACITY_AUTH: stateful secret file must contain valid JSON credentials");
  } finally {
    buffer.fill(0);
  }
}

export async function readStatefulCredentials(options) {
  if (!options.authSecretFile) throw new Error("CAPACITY_AUTH: stateful rehearsal requires --auth-secret-file");
  const credentials = await readStatefulCredentialsFile(options.authSecretFile);
  return {
    credentials,
    cleanup: async () => {
      await unlink(options.authSecretFile).catch(() => {});
    },
  };
}

async function promptVisible(question, input, output) {
  const readline = createInterface({ input, output });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function promptHidden(question, input, output) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("CAPACITY_AUTH: hidden password input requires a TTY; use --auth-secret-file");
  }
  output.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("CAPACITY_AUTH: interactive input cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

export async function readInteractiveCredentials({ input = process.stdin, output = process.stderr } = {}) {
  const records = [];
  for (const identity of AUTH_IDENTITIES) {
    const identifier = await promptVisible(`${identity} account: `, input, output);
    const password = await promptHidden(`${identity} password: `, input, output);
    records.push({ identity, identifier, password });
  }
  return normalizeCredentials(records);
}

export async function readAuthCredentials(options, io = {}) {
  if (options.authSecretFile) {
    const credentials = await readCredentialsFile(options.authSecretFile);
    return {
      credentials,
      cleanup: async () => {
        await unlink(options.authSecretFile).catch(() => {});
      },
    };
  }
  if (options.authStdin) {
    return { credentials: await readInteractiveCredentials(io), cleanup: async () => {} };
  }
  throw new Error("CAPACITY_AUTH: provide --auth-secret-file or --auth-stdin");
}

export function clearCredentials(credentials = []) {
  for (const credential of credentials) {
    credential.identifier = "";
    credential.password = "";
  }
}

export async function loadManifest(file) {
  const raw = await readFile(file, "utf8");
  assertNoSecretText(raw, "manifest");
  assertNoCredentialFields(raw, "manifest");
  const manifest = JSON.parse(raw);
  const sourceActors = Array.isArray(manifest?.actors) ? manifest.actors : manifest?.identities;
  if (!manifest || !Array.isArray(sourceActors)) {
    throw new Error("CAPACITY_MANIFEST: actors[] or identities[] is required");
  }
  const seen = new Set();
  const actors = sourceActors.map((actor, index) => {
    if (!actor || typeof actor !== "object") throw new Error(`CAPACITY_MANIFEST: actor ${index} is invalid`);
    const actorId = String(actor.actor_id || actor.actorId || actor.identity || "");
    if (!RUN_ID.test(actorId) && !AUTH_IDENTITIES.includes(actorId.toUpperCase())) throw new Error(`CAPACITY_MANIFEST: actor ${index} has an invalid actor_id`);
    if (seen.has(actorId)) throw new Error(`CAPACITY_MANIFEST: duplicate actor_id ${actorId}`);
    seen.add(actorId);
    if (actor.access_token || actor.accessToken || actor.refresh_token || actor.refreshToken || actor.password) {
      throw new Error("CAPACITY_MANIFEST: credentials must never be stored in manifest");
    }
    return {
      actorId,
      userId: actor.user_id || actor.userId || "UNKNOWN",
      mode: actor.mode || "UNKNOWN",
      profile: actor.profile || "UNKNOWN",
      tokenExpiry: actor.token_expiry || actor.tokenExpiry || "UNKNOWN",
      role: actor.role || actor.mode || "UNKNOWN",
      match: actor.match && typeof actor.match === "object" ? actor.match : null,
      scenario: actor.scenario || null,
    };
  });
  if (actors.length > STATEFUL_MAX_USERS) throw new Error(`CAPACITY_MANIFEST: maximum ${STATEFUL_MAX_USERS} identities`);
  const readerAllocation = manifest.reader_allocation || manifest.readerAllocation || null;
  return { ...manifest, actors, readerAllocation };
}

export function buildReaderAllocation({ actors, maxUsers, readerAllocation = null }) {
  const selected = actors.slice(0, Math.min(actors.length, maxUsers));
  if (selected.length === 0) throw new Error("CAPACITY_PLAN: no identities selected");
  if (readerAllocation && typeof readerAllocation === "object") {
    const weights = selected.map((actor) => Math.max(0, Number(readerAllocation[actor.actorId] || 0)));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    if (weightTotal > 0) {
      const scaled = weights.map((weight) => (maxUsers * weight) / weightTotal);
      const counts = scaled.map(Math.floor);
      let remainder = maxUsers - counts.reduce((sum, value) => sum + value, 0);
      [...scaled.keys()].sort((left, right) => (scaled[right] - counts[right]) - (scaled[left] - counts[left])).forEach((index) => {
        if (remainder > 0) {
          counts[index] += 1;
          remainder -= 1;
        }
      });
      return selected.map((actor, index) => ({ actorId: actor.actorId, count: counts[index] }));
    }
  }
  return selected.map((actor, index) => ({ actorId: actor.actorId, count: index < maxUsers ? 1 : 0 }));
}

export function buildReadOnlyPlan({ actors, maxUsers, maxRequests, runId, readerAllocation = null }) {
  const allocation = buildReaderAllocation({ actors, maxUsers, readerAllocation });
  const readers = [];
  for (const { actorId, count } of allocation) {
    for (let index = 0; index < count; index += 1) {
      readers.push({ actorId, readerId: `${actorId}-reader-${String(index + 1).padStart(3, "0")}` });
    }
  }
  if (readers.length === 0) throw new Error("CAPACITY_PLAN: no virtual readers selected");
  const requests = [];
  for (const reader of readers) {
    requests.push({ ...reader, path: "/", authenticated: false });
    requests.push({ ...reader, path: "/api/config", authenticated: false });
    requests.push({ ...reader, path: "/api/state", authenticated: true });
    requests.push({ ...reader, path: "/api/session", authenticated: true });
    requests.push({ ...reader, path: "/js/app.js", authenticated: false });
  }
  // Static CSS and health checks are shared samples, not extra requests
  // assigned to a synthetic reader. This keeps every reader at five
  // requests (and below the six-request safety limit).
  const staticSamples = Math.max(1, Math.floor(readers.length / 10));
  for (let index = 0; index < staticSamples; index += 1) {
    requests.push({ actorId: "__shared__", readerId: "__shared__", path: "/styles/product-shell.css", authenticated: false });
  }
  const healthCount = Math.max(1, Math.floor(readers.length / 10));
  for (let index = 0; index < healthCount; index += 1) {
    requests.push({ actorId: "__shared__", readerId: "__shared__", path: "/api/health", authenticated: false });
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
    maxUsers: readers.length,
    maxRequests,
    requests,
    readerAllocation: Object.fromEntries(allocation.map(({ actorId, count }) => [actorId, count])),
    healthRequests,
    healthRatio: healthRequests / requests.length,
    perReaderMaximum: Math.max(...readers.map((reader) => requests.filter((request) => request.readerId === reader.readerId).length)),
  };
}

export async function fetchJson({ url, method = "GET", headers = {}, body, timeoutMs = 10_000, timeoutSource = "request", requestContext = null, ledger = null }) {
  const controller = new AbortController();
  const requestId = headers["X-Request-ID"] || randomUUID();
  const started = performance.now();
  const startedAt = new Date().toISOString();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(timeoutError(timeoutSource, `${method} ${new URL(url).pathname} timed out`));
  }, timeoutMs);
  const append = async (error = null, response = null, data = null) => {
    if (!requestContext || !ledger) return;
    await ledger.append(buildActionEvent({
      runId: requestContext.runId,
      actorId: requestContext.actorId || "__system__",
      action: requestContext.action,
      endpoint: new URL(url).pathname,
      requestId,
      startedAt,
      finishedAt: new Date().toISOString(),
      latencyMs: performance.now() - started,
      httpStatus: response?.status ?? null,
      error,
      identifiers: requestContext.identifiers,
      expectedState: requestContext.expectedState,
      actualState: data,
    }));
  };
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: "application/json", "X-Request-ID": requestId, ...headers },
      body,
      signal: controller.signal,
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Keep response bodies out of errors and evidence.
    }
    const responseError = response.status >= 400 ? Object.assign(new Error(`HTTP_${response.status}`), { name: "HttpError", code: `HTTP_${response.status}` }) : null;
    await append(responseError, response, null);
    return { response, data };
  } catch (error) {
    const typedError = timedOut
      ? (error instanceof CapacityTimeoutError ? error : timeoutError(timeoutSource, `${method} ${new URL(url).pathname} timed out`, error))
      : error;
    await append(typedError);
    throw typedError;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadAuthConfig(baseUrl, requestOptions = {}) {
  const { response, data } = await fetchJson({ url: new URL("/api/config", baseUrl).toString(), timeoutSource: "auth", ...requestOptions });
  if (response.status !== 200 || !data?.supabaseUrl || !data?.supabaseAnonKey) {
    throw new Error(`CAPACITY_AUTH: /api/config returned HTTP ${response.status}`);
  }
  return { supabaseUrl: data.supabaseUrl, supabaseAnonKey: data.supabaseAnonKey };
}

export async function authenticateIdentity({ baseUrl, credential, ledger = null, runId = "", actorId = credential?.identity || "__system__" }) {
  const clientInstanceId = `capacity:${runId || "standalone"}:${actorId}`;
  const loginBody = JSON.stringify({ identifier: credential.identifier, password: credential.password });
  const login = await fetchJson({
    url: new URL("/api/auth/login", baseUrl).toString(),
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client-Instance-ID": clientInstanceId },
    body: loginBody,
    timeoutSource: "auth",
    requestContext: { runId, actorId, action: "auth.login" },
    ledger,
  });
  if (login.response.status !== 200 || !login.data?.email || !login.data?.user_id || !login.data?.session?.access_token || !login.data?.session?.refresh_token) {
    throw new Error(`CAPACITY_AUTH: identity ${credential.identity} login returned HTTP ${login.response.status}`);
  }

  const data = {
    user: { id: login.data.user_id },
    session: login.data.session,
  };
  if (ledger) {
    await ledger.append(buildActionEvent({
      runId,
      actorId,
      action: "auth.session_from_login",
      endpoint: "/api/auth/login",
      requestId: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: 200,
      error: null,
      actualState: null,
    }));
  }
  return {
    identity: credential.identity,
    authUserId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token || "",
    email: login.data.email,
    tokenExpiry: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : "UNKNOWN",
    clientInstanceId,
  };
}

async function authenticatedGet({ baseUrl, path: requestPath, token, clientInstanceId }) {
  const { response, data } = await fetchJson({
    url: new URL(requestPath, baseUrl).toString(),
    headers: { Authorization: `Bearer ${token}`, "X-Client-Instance-ID": clientInstanceId },
  });
  return { status: response.status, data };
}

export async function authenticateActors({ baseUrl, actors, credentials, runId, authDelayMs = 10_000 }) {
  const credentialsByIdentity = new Map(credentials.map((credential) => [credential.identity, credential]));
  const smoke = [];
  for (const [index, actor] of actors.entries()) {
    const credential = credentialsByIdentity.get(actor.actorId.toUpperCase());
    if (!credential) throw new Error(`CAPACITY_AUTH: no credential for identity ${actor.actorId}`);
    if (index > 0) await sleep(Math.max(1_000, Number(authDelayMs) || 10_000));
    const session = await authenticateIdentity({ baseUrl, credential });
    Object.defineProperty(actor, "accessToken", { configurable: true, enumerable: false, writable: true, value: session.accessToken });
    const state = await authenticatedGet({ baseUrl, path: "/api/state", token: session.accessToken, clientInstanceId: session.clientInstanceId });
    if (state.status !== 200 || !state.data?.user?.id) {
      throw new Error(`CAPACITY_AUTH: identity ${actor.actorId} /api/state returned HTTP ${state.status}`);
    }
    const sessionState = await authenticatedGet({ baseUrl, path: "/api/session", token: session.accessToken, clientInstanceId: session.clientInstanceId });
    if (sessionState.status !== 200 || sessionState.data?.authenticated !== true || sessionState.data?.profile?.id !== state.data.user.id) {
      throw new Error(`CAPACITY_AUTH: identity ${actor.actorId} state scope check failed`);
    }
    smoke.push({
      identity: actor.actorId,
      userId: state.data.user.id,
      tokenExpiry: session.tokenExpiry,
      stateStatus: state.status,
      sessionStatus: sessionState.status,
      mutationExecuted: false,
      runId,
    });
  }
  const userIds = new Set(smoke.map((record) => record.userId));
  if (userIds.size !== smoke.length) throw new Error("CAPACITY_AUTH: identity isolation failed; user IDs are not distinct");
  return { smoke, identityIsolation: true };
}

export function clearActorTokens(actors = []) {
  for (const actor of actors) {
    if (Object.prototype.hasOwnProperty.call(actor, "accessToken")) actor.accessToken = "";
    if (Object.prototype.hasOwnProperty.call(actor, "refreshToken")) actor.refreshToken = "";
  }
}

export function buildAuthManifest({ runId, endpoint = "/api/state", smoke }) {
  const identities = smoke.map(({ identity, userId, tokenExpiry }) => ({
    identity,
    user_id: userId,
    token_expiry: tokenExpiry,
  }));
  const manifest = {
    run_id: runId,
    endpoint,
    reader_allocation: { A: 34, B: 33, C: 33 },
    identities,
  };
  assertNoCredentialFields(manifest, "auth manifest");
  return manifest;
}

export async function writeAuthManifest(file, manifest) {
  assertNoCredentialFields(manifest, "auth manifest");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
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
    const token = actor?.accessToken || "";
    if (!token) throw new Error(`CAPACITY_AUTH: missing in-memory session for ${actor?.actorId || request.actorId}`);
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
      readerId: request.readerId,
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
      const result = { at: new Date().toISOString(), actorId: request.actorId, readerId: request.readerId, path: request.path, method: "GET", status: null, durationMs: Number((performance.now() - started).toFixed(2)), authenticated: request.authenticated, errorClass: "timeout" };
      if (options.abortOnTimeout) throw Object.assign(new Error("request timeout"), { result });
      return result;
    }
    if (error?.result) throw error;
    throw Object.assign(new Error(safeError(error)), { result: { at: new Date().toISOString(), actorId: request.actorId, readerId: request.readerId, path: request.path, method: "GET", status: null, durationMs: Number((performance.now() - started).toFixed(2)), authenticated: request.authenticated, errorClass: "network" } });
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
    statefulExecution: "current acceptance uses --stages 10,50,200; diagnostic levels remain 5 -> 10 -> 20 -> 30 -> 40 -> 50 -> 75 -> 100 -> 125 -> 150 -> 200 -> 300 -> 400 -> 500",
  };
}

export async function writeEvidence({ directory, manifest, plan, result }) {
  await mkdir(directory, { recursive: true });
  const safeManifest = {
    run_id: manifest.run_id || result?.runId || "UNKNOWN",
    release_candidate: manifest.release_candidate || "UNKNOWN",
    endpoint: manifest.endpoint || "/api/state",
    reader_allocation: manifest.readerAllocation || manifest.reader_allocation || null,
    actors: manifest.actors.map(({ actorId, userId, mode, profile, tokenExpiry, role, match, scenario }) => ({ actor_id: actorId, user_id: userId, mode, profile, token_expiry: tokenExpiry, role, match, scenario })),
  };
  assertNoCredentialFields(safeManifest, "evidence manifest");
  await writeFile(path.join(directory, "run-manifest.json"), `${JSON.stringify(safeManifest, null, 2)}\n`);
  await writeFile(path.join(directory, "api-metrics.json"), `${JSON.stringify(result?.metrics || { status: "NOT_EXECUTED" }, null, 2)}\n`);
  await writeFile(path.join(directory, "resource-metrics.json"), `${JSON.stringify({ before: result?.resourceBefore || null, after: result?.resourceAfter || null }, null, 2)}\n`);
  await writeFile(path.join(directory, "actor-events.ndjson"), `${(result?.results || []).map((event) => JSON.stringify(event)).join("\n")}\n`);
  await writeFile(path.join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
}

export function helpText() {
  return `Usage:\n  pnpm capacity:run -- --dry-run --run-id <id>\n  pnpm capacity:run -- --prepare-auth --base-url <url> --run-id <id> --auth-secret-file <0600-file> --manifest-out <safe-file> --allow-production --production-ack <id>\n  pnpm capacity:run -- --execute-read-only --base-url <url> --run-id <id> --manifest <file> --auth-secret-file <0600-file> --max-users <n> --max-rps <n> --max-requests <n> --allow-production --production-ack <id>\n\nSafety:\n  dry-run is the default and performs no network request. Auth preparation accepts credentials only through hidden TTY stdin or a 0600 JSON file; credentials and access tokens never enter manifests, evidence, logs, or command arguments. Auth uses one normal /api/auth/login request per identity and reuses the returned session; identity logins are paced by --auth-delay-ms (default 10000ms). Read-only execution only permits GET/HEAD on the fixed allowlist. Production execution requires --allow-production and --production-ack=<run-id>. Stateful mode requires --stateful-approval=<run-id>; the current acceptance command uses --stages 10,50,200.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (options.mode === "dry-run") {
    const manifest = options.manifest ? await loadManifest(options.manifest) : { actors: [] };
    console.log(JSON.stringify(dryRunPlan({ options, manifest }), null, 2));
    return;
  }
  if (options.mode === "stateful") {
    const { buildStatefulPlan, runStatefulRehearsal, statefulDryRunPlan, writeStatefulEvidence, writeStatefulFailureEvidence } = await import("./stateful-adapter.mjs");
    const manifest = await loadManifest(options.manifest);
    if (options.scenario === "dry-run") {
      console.log(JSON.stringify(statefulDryRunPlan({ actors: manifest.actors, runId: options.runId, maxUsers: options.maxUsers, stages: options.stages }), null, 2));
      return;
    }
    const statefulAuth = await readStatefulCredentials(options);
    try {
      buildStatefulPlan({ actors: manifest.actors, runId: options.runId, maxUsers: options.maxUsers, stages: options.stages });
      const directory = options.evidenceDir || path.join(process.cwd(), "output", "capacity-validation", options.runId);
      try {
        const result = await runStatefulRehearsal({ options, manifest, credentials: statefulAuth.credentials });
        await writeStatefulEvidence({ directory, manifest, result });
        console.log(JSON.stringify({ runId: result.runId, mode: result.mode, startedAt: result.startedAt, endedAt: result.endedAt, stages: result.stages, identityIsolation: result.identityIsolation, evidenceDir: directory }, null, 2));
      } catch (error) {
        await writeStatefulFailureEvidence({ directory, manifest, runId: options.runId, error }).catch(() => {});
        throw error;
      }
    } finally {
      clearCredentials(statefulAuth.credentials);
      await statefulAuth.cleanup();
    }
    return;
  }
  let authInput = null;
  let manifest = { actors: [] };
  try {
    authInput = await readAuthCredentials(options);
    if (options.mode === "auth-prepare") {
      manifest = { actors: AUTH_IDENTITIES.map((identity) => ({ actorId: identity, userId: "UNKNOWN", mode: "authenticated-read", profile: "synthetic" })) };
      const authResult = await authenticateActors({ baseUrl: options.baseUrl, actors: manifest.actors, credentials: authInput.credentials, runId: options.runId, authDelayMs: options.authDelayMs });
      const safeManifest = buildAuthManifest({ runId: options.runId, smoke: authResult.smoke });
      await writeAuthManifest(options.manifestOut, safeManifest);
      console.log(JSON.stringify({
        runId: options.runId,
        authenticatedIdentities: authResult.smoke.length,
        stateSmoke: authResult.smoke.map(({ identity, userId, stateStatus, sessionStatus, tokenExpiry, mutationExecuted }) => ({ identity, userId, stateStatus, sessionStatus, tokenExpiry, mutationExecuted })),
        identityIsolation: authResult.identityIsolation,
        manifest: options.manifestOut,
        secretPersistedInEvidence: false,
        productionMutation: false,
      }, null, 2));
      return;
    }
    manifest = await loadManifest(options.manifest);
    const authResult = await authenticateActors({ baseUrl: options.baseUrl, actors: manifest.actors, credentials: authInput.credentials, runId: options.runId, authDelayMs: options.authDelayMs });
    const plan = buildReadOnlyPlan({ actors: manifest.actors, maxUsers: options.maxUsers, maxRequests: options.maxRequests, runId: options.runId, readerAllocation: manifest.readerAllocation });
    const result = await runReadOnlyBurst({ options, manifest, plan });
    const directory = options.evidenceDir || path.join(process.cwd(), "output", "capacity-validation", options.runId);
    await writeEvidence({ directory, manifest, plan, result });
    console.log(JSON.stringify({ ...result, authSmoke: authResult.smoke.map(({ identity, userId, stateStatus, sessionStatus }) => ({ identity, userId, stateStatus, sessionStatus })), identityIsolation: authResult.identityIsolation, evidenceDir: directory }, null, 2));
    if (result.metrics.aborted || result.metrics.five_xx || result.metrics.timeout || result.metrics.rate_limited) process.exitCode = 1;
  } finally {
    clearActorTokens(manifest.actors);
    clearCredentials(authInput?.credentials);
    await authInput?.cleanup?.();
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
