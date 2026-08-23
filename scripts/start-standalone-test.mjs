import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const standaloneRoot = resolve(root, ".next/standalone");

// Mirror the two COPY instructions in Dockerfile's runner stage.
await cp(resolve(root, "public"), resolve(standaloneRoot, "public"), { recursive: true, force: true });
await cp(resolve(root, ".next/static"), resolve(standaloneRoot, ".next/static"), { recursive: true, force: true });

const child = spawn(process.execPath, [resolve(standaloneRoot, "server.js")], {
  cwd: standaloneRoot,
  env: process.env,
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
