function safeError(error) {
  return {
    name: String(error?.name || "Error"),
    code: error?.code ? String(error.code) : null,
    message: String(error?.message || error || "unknown error")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/(?:password|access[_-]?token|refresh[_-]?token|authorization)[=:]\s*\S+/gi, "$1=[REDACTED]"),
  };
}

async function runPool(values, concurrency, worker) {
  const items = Array.from(values);
  let cursor = 0;
  const workers = Math.min(items.length, Math.max(1, Number(concurrency) || 1));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function waitForStart(value) {
  if (!value) return;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("CAPACITY_DISTRIBUTED: invalid scheduled start");
  const delay = timestamp - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

export async function runDistributedAgent({ job, credentials, driver, concurrency } = {}) {
  if (!job?.nodeId || !Array.isArray(job.cycles) || !Array.isArray(credentials) || !driver) {
    throw new Error("CAPACITY_DISTRIBUTED: job, credentials, and driver are required");
  }
  const credentialByActor = new Map(credentials.map((credential) => [credential.identity, credential]));
  const actorIds = [...new Set(job.cycles.flatMap((cycle) => cycle.actors.map((actor) => actor.actorId)))];
  const actorConcurrency = Math.min(
    actorIds.length,
    Math.max(1, Number(concurrency) || actorIds.length),
  );
  const reports = new Map(actorIds.map((actorId) => [actorId, { actorId, cycles: [] }]));
  const runtimes = new Map();
  let fatal = false;
  let fatalError = null;
  let nonFatalErrors = 0;
  const egressId = await driver.egressId();

  try {
    await waitForStart(job.authStartAt);
    await runPool(actorIds, actorConcurrency, async (actorId) => {
      const credential = credentialByActor.get(actorId);
      if (!credential) {
        nonFatalErrors += 1;
        reports.get(actorId).authenticationError = safeError(new Error(`missing credential for ${actorId}`));
        return;
      }
      try {
        runtimes.set(actorId, await driver.authenticate(credential, { runId: job.runId, nodeId: job.nodeId }));
      } catch (error) {
        nonFatalErrors += 1;
        reports.get(actorId).authenticationError = safeError(error);
      } finally {
        credential.password = "";
      }
    });

    for (const cycle of job.cycles) {
      if (fatal) break;
      await waitForStart(cycle.startAt);
      await runPool(cycle.actors, actorConcurrency, async (actor) => {
        const runtime = runtimes.get(actor.actorId);
        const actorReport = reports.get(actor.actorId);
        if (!runtime) {
          actorReport.cycles.push({ cycle: cycle.cycle, completed: false, exited: false, error: actorReport.authenticationError || safeError(new Error("authentication unavailable")) });
          return;
        }
        try {
          const result = await driver.runCycle(runtime, actor, cycle.cycle, { roomHoldMs: cycle.roomHoldMs, runId: job.runId, nodeId: job.nodeId });
          actorReport.cycles.push({ cycle: cycle.cycle, completed: true, exited: result?.exited !== false, metrics: result?.metrics || null });
        } catch (error) {
          const isFatal = Boolean(error?.fatal || driver.isFatal?.(error));
          actorReport.cycles.push({ cycle: cycle.cycle, completed: false, exited: false, fatal: isFatal, error: safeError(error) });
          if (isFatal) {
            fatal = true;
            fatalError = safeError(error);
          } else {
            nonFatalErrors += 1;
          }
        }
      });
    }
  } finally {
    await runPool(runtimes.values(), actorConcurrency, async (runtime) => {
      try {
        await driver.exit(runtime, { runId: job.runId, nodeId: job.nodeId });
      } catch (error) {
        nonFatalErrors += 1;
        const actorId = runtime.actorId;
        if (reports.has(actorId)) reports.get(actorId).cleanupError = safeError(error);
      }
    });
  }

  return {
    schemaVersion: 1,
    runId: job.runId,
    nodeId: job.nodeId,
    egressId: String(egressId || "unknown"),
    fatal,
    fatalError,
    nonFatalErrors,
    actors: [...reports.values()],
  };
}
