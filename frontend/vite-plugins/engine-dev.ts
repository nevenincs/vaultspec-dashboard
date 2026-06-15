import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

// Robust local dev orchestrator for the live UX survey.
//
// The dashboard is two processes: the Rust `vaultspec serve` engine (the wire,
// `dashboard-layer-ownership`) and this Vite SPA dev server (the glass). Vite
// gives us HMR for `frontend/src` for free, and the engine already streams
// `.vault/` content changes over SSE — so chrome edits and corpus edits both
// auto-update with no help. What this plugin adds is the missing third axis:
// ENGINE SOURCE changes (`engine/crates/**/*.rs`) must rebuild the binary,
// restart the running service, and force the browser to reload so the user is
// always looking at the real current implementation.
//
// Design goals, in priority order:
//   1. Always-live: every implementation change (chrome / corpus / engine)
//      ends in a visible auto-refresh.
//   2. No stale cache: forced dep re-optimization + a wiped esbuild cache +
//      `Cache-Control: no-store` so a previous build never bleeds through.
//   3. Robust under concurrency: a failing `cargo build` (mid-edit by another
//      campaign) NEVER tears down the running engine — the last-good binary
//      keeps serving and an overlay reports the break.

type EngineMode = "manage" | "adopt" | "off";

interface ServiceInfo {
  port: number;
  pid: number;
}

const DEBOUNCE_MS = 1500;
const HEALTH_TIMEOUT_MS = 20000;
const HEALTH_POLL_MS = 300;
const RESPAWN_DELAY_MS = 1500;
const MAX_RESPAWNS = 5;

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`\x1b[36m[engine]\x1b[0m ${message}`);
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`\x1b[33m[engine]\x1b[0m ${message}`);
}

function resolvePort(): number {
  const raw = process.env.VAULTSPEC_DEV_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8767;
}

function resolveMode(): EngineMode {
  const raw = (process.env.VAULTSPEC_DEV_ENGINE ?? "manage").toLowerCase();
  return raw === "adopt" || raw === "off" ? raw : "manage";
}

function binaryPath(repoRoot: string): string {
  const exe = process.platform === "win32" ? "vaultspec.exe" : "vaultspec";
  return resolve(repoRoot, "engine", "target", "debug", exe);
}

function readService(repoRoot: string): ServiceInfo | null {
  try {
    const raw = readFileSync(
      resolve(repoRoot, ".vault", "data", "engine-data", "service.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<ServiceInfo>;
    if (typeof parsed.port === "number" && typeof parsed.pid === "number") {
      return { port: parsed.port, pid: parsed.pid };
    }
  } catch {
    /* no service file yet */
  }
  return null;
}

async function isHealthy(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitHealthy(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(port)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

function killPid(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    /* already gone */
  }
}

/**
 * Build the engine binary. Synchronous and blocking on purpose: a rebuild must
 * fully settle before we swap the running service, and we never want two builds
 * racing the same `target/` dir. Returns true on a clean build.
 */
function buildEngine(repoRoot: string): boolean {
  log("building engine (cargo build -p vaultspec-cli)…");
  const started = Date.now();
  const result = spawnSync(
    "cargo",
    [
      "build",
      "--manifest-path",
      resolve(repoRoot, "engine", "Cargo.toml"),
      "-p",
      "vaultspec-cli",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) {
    log(`engine build OK (${secs}s)`);
    return true;
  }
  warn(`engine build FAILED (${secs}s) — keeping the last-good engine running`);
  return false;
}

export function engineDevPlugin(): Plugin {
  const mode = resolveMode();
  const port = resolvePort();

  let repoRoot = "";
  let child: ChildProcess | null = null;
  let watcher: FSWatcher | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let shuttingDown = false;
  let respawns = 0;

  // A stale process holding the port (a crashed prior dev run, or a zombie that
  // lost the bind) makes a fresh `serve` fail to bind and pile up — the exact
  // 10-engines-on-one-port failure seen under heavy concurrency. If nothing
  // HEALTHY answers but service.json names a pid, clear it before binding.
  async function clearStalePort(repo: string): Promise<void> {
    if (await isHealthy(port)) return;
    const stale = readService(repo);
    if (stale) {
      warn(`port ${port} has a stale (unhealthy) engine pid ${stale.pid} — clearing it`);
      killPid(stale.pid);
    }
  }

  function startEngine(repo: string): void {
    if (shuttingDown) return;
    const bin = binaryPath(repo);
    log(`starting: ${bin} serve --port ${port}`);
    const proc = spawn(bin, ["serve", "--port", String(port)], {
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => process.stdout.write(d));
    proc.stderr?.on("data", (d: string) => process.stderr.write(d));
    proc.on("exit", (code) => {
      if (shuttingDown || child !== proc) return;
      child = null;
      if (respawns >= MAX_RESPAWNS) {
        warn(
          `engine exited (code ${code ?? "?"}) and hit the respawn ceiling (${MAX_RESPAWNS}) — ` +
            `not respawning. Fix the engine, then restart the dev server.`,
        );
        return;
      }
      respawns += 1;
      warn(
        `engine exited (code ${code ?? "?"}) — respawn ${respawns}/${MAX_RESPAWNS} in ${RESPAWN_DELAY_MS}ms`,
      );
      setTimeout(() => {
        if (shuttingDown || child) return;
        // Never pile a second engine onto a port someone else already healed.
        void isHealthy(port).then((up) => {
          if (up) {
            log("another healthy engine appeared on the port — adopting it instead of respawning");
          } else if (!child) {
            startEngine(repo);
          }
        });
      }, RESPAWN_DELAY_MS);
    });
  }

  function stopEngine(): void {
    if (child?.pid) {
      killPid(child.pid);
      child = null;
    }
  }

  async function rebuildAndReload(server: ViteDevServer): Promise<void> {
    if (building) return;
    building = true;
    try {
      if (!buildEngine(repoRoot)) {
        server.ws.send({
          type: "error",
          err: {
            message:
              "Engine rebuild failed — the running engine is unchanged. See terminal for cargo output.",
            stack: "",
          },
        });
        return;
      }
      log("swapping in the rebuilt engine…");
      // We own the lifecycle here: kill whatever is on the port (our child, or
      // an adopted pid from service.json) before binding the fresh binary.
      respawns = 0;
      stopEngine();
      const adopted = readService(repoRoot);
      if (adopted) killPid(adopted.pid);
      startEngine(repoRoot);
      if (await waitHealthy(port, HEALTH_TIMEOUT_MS)) {
        log("engine healthy — reloading browser");
        server.ws.send({ type: "full-reload" });
      } else {
        warn("engine did not come back healthy within timeout");
      }
    } finally {
      building = false;
    }
  }

  return {
    name: "vaultspec:engine-dev",
    apply: "serve",

    config(_config, { command }) {
      if (command !== "serve" || process.env.VITEST) return;
      // Cache hygiene: re-bundle deps every dev boot and forbid the browser
      // from holding any prior asset, so a stale optimized chunk can never
      // mask the current implementation.
      return {
        optimizeDeps: { force: true },
        server: { headers: { "Cache-Control": "no-store" } },
      };
    },

    configResolved(config) {
      repoRoot = resolve(config.root, "..");
      if (config.command !== "serve" || process.env.VITEST) return;
      // Wipe the on-disk esbuild dep cache for a clean slate.
      try {
        rmSync(resolve(config.root, "node_modules", ".vite"), {
          recursive: true,
          force: true,
        });
      } catch {
        /* nothing to clear */
      }
    },

    async configureServer(server: ViteDevServer) {
      if (process.env.VITEST) return;
      repoRoot = resolve(server.config.root, "..");

      if (mode === "off") {
        log("VAULTSPEC_DEV_ENGINE=off — assuming an externally managed engine");
        return;
      }

      const cleanup = (): void => {
        shuttingDown = true;
        if (debounce) clearTimeout(debounce);
        watcher?.close();
        stopEngine();
      };
      server.httpServer?.once("close", cleanup);
      process.once("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        cleanup();
        process.exit(0);
      });

      // Bring an engine up if one is not already serving this worktree.
      const alreadyUp = await isHealthy(port);
      if (alreadyUp) {
        log(`adopting the engine already serving on :${port}`);
      } else {
        await clearStalePort(repoRoot);
        if (!existsSync(binaryPath(repoRoot))) buildEngine(repoRoot);
        startEngine(repoRoot);
        if (await waitHealthy(port, HEALTH_TIMEOUT_MS)) {
          log(`engine healthy on :${port}`);
        } else {
          warn(`engine not healthy on :${port} yet — the proxy will retry`);
        }
      }

      if (mode === "adopt") {
        log("mode=adopt — not watching engine source (chrome HMR + corpus SSE only)");
        return;
      }

      // mode=manage: watch the Rust source and rebuild+restart+reload on change.
      const cratesDir = resolve(repoRoot, "engine", "crates");
      log(`watching ${cratesDir} for engine source changes`);
      watcher = watch(cratesDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const name = filename.toString().replace(/\\/g, "/");
        if (!name.endsWith(".rs") || name.includes("/target/")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          log(`engine source changed (${name}) → rebuilding`);
          void rebuildAndReload(server);
        }, DEBOUNCE_MS);
      });
    },
  };
}
