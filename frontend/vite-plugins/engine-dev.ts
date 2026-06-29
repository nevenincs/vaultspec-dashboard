import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, watch, type FSWatcher } from "node:fs";
import { Socket } from "node:net";
import { resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { DEV_PORTS } from "../dev-ports";

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
  // Canonical engine dev port (./dev-ports.ts honours VAULTSPEC_DEV_PORT).
  return DEV_PORTS.engine;
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
  // Returns true if it killed a stale vaultspec pid (our territory), false if
  // there was nothing of ours to clear.
  async function clearStalePort(repo: string): Promise<boolean> {
    if (await isHealthy(port)) return false;
    const stale = readService(repo);
    if (stale) {
      warn(
        `port ${port} has a stale (unhealthy) engine pid ${stale.pid} — clearing it`,
      );
      killPid(stale.pid);
      return true;
    }
    return false;
  }

  // Fail-fast preflight: is the engine port already accepting connections from
  // SOMETHING? A quick TCP connect — true means occupied. Used to abort the dev
  // boot when a FOREIGN process (another project's server) squats our locked
  // port, instead of respawn-looping the engine against an unbindable port.
  function portOccupied(p: number): Promise<boolean> {
    return new Promise((resolveOccupied) => {
      const socket = new Socket();
      const finish = (occupied: boolean): void => {
        socket.destroy();
        resolveOccupied(occupied);
      };
      socket.setTimeout(500);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(p, "127.0.0.1");
    });
  }

  // Schedule a bounded respawn. Shared by the exit and spawn-error paths so a
  // crash NEVER escapes as an unhandled error that tears down the Vite process.
  function scheduleRespawn(repo: string, reason: string): void {
    if (shuttingDown) return;
    if (respawns >= MAX_RESPAWNS) {
      warn(
        `${reason} and hit the respawn ceiling (${MAX_RESPAWNS}) — not respawning. ` +
          `This is usually host memory/paging-file exhaustion; free memory, then restart the dev server.`,
      );
      return;
    }
    respawns += 1;
    warn(`${reason} — respawn ${respawns}/${MAX_RESPAWNS} in ${RESPAWN_DELAY_MS}ms`);
    setTimeout(() => {
      if (shuttingDown || child) return;
      // Never pile a second engine onto a port someone else already healed.
      void isHealthy(port)
        .then((up) => {
          if (up) {
            log(
              "another healthy engine appeared on the port — adopting it instead of respawning",
            );
          } else if (!child) {
            startEngine(repo);
          }
        })
        .catch(() => {
          /* health probe failed; the next change/respawn will retry */
        });
    }, RESPAWN_DELAY_MS);
  }

  function startEngine(repo: string): void {
    if (shuttingDown) return;
    const bin = binaryPath(repo);
    log(`starting: ${bin} serve --port ${port}`);
    let proc: ChildProcess;
    try {
      // spawn() can throw SYNCHRONOUSLY under host resource exhaustion
      // (Windows "spawn UNKNOWN", errno -4094) — that escaping uncaught is what
      // previously killed the whole dev server. Catch it and treat it as a
      // recoverable engine failure.
      proc = spawn(bin, ["serve", "--port", String(port)], {
        cwd: repo,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      child = null;
      scheduleRespawn(repo, `engine spawn threw (${(err as Error).message})`);
      return;
    }
    child = proc;
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => process.stdout.write(d));
    proc.stderr?.on("data", (d: string) => process.stderr.write(d));
    // An async spawn failure surfaces as an 'error' event; without this handler
    // Node throws it as an uncaught exception and Vite dies with it.
    proc.on("error", (err) => {
      if (shuttingDown || child !== proc) return;
      child = null;
      scheduleRespawn(repo, `engine spawn error (${err.message})`);
    });
    proc.on("exit", (code) => {
      if (shuttingDown || child !== proc) return;
      child = null;
      scheduleRespawn(repo, `engine exited (code ${code ?? "?"})`);
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
      // On Windows the running engine holds `target/debug/vaultspec.exe` open,
      // so cargo cannot relink the binary in place — the build fails with
      // "Access is denied (os error 5)" for as long as the engine runs, an
      // unbreakable fail→overlay loop. There we must stop the engine BEFORE
      // building; a failed build leaves the last-good binary on disk untouched,
      // so we can always bring it back. On other platforms a running executable
      // can be overwritten, so we keep building first and the last-good engine
      // keeps serving through the build (design goal #3, preserved off-Windows).
      const stopFirst = process.platform === "win32";
      if (stopFirst) {
        respawns = 0;
        stopEngine();
        const adopted = readService(repoRoot);
        if (adopted) killPid(adopted.pid);
        // Give Windows a beat to release the file handle before cargo relinks.
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!buildEngine(repoRoot)) {
        server.ws.send({
          type: "error",
          err: {
            message:
              "Engine rebuild failed — see terminal for cargo output. The last-good engine is kept alive.",
            stack: "",
          },
        });
        // On Windows we stopped the engine before the (failed) build; restart
        // the untouched last-good binary so the dashboard keeps working.
        if (stopFirst && !child) {
          startEngine(repoRoot);
          await waitHealthy(port, HEALTH_TIMEOUT_MS);
        }
        return;
      }
      log("swapping in the rebuilt engine…");
      // We own the lifecycle here: kill whatever is on the port (our child, or
      // an adopted pid from service.json) before binding the fresh binary.
      respawns = 0;
      if (!stopFirst) {
        stopEngine();
        const adopted = readService(repoRoot);
        if (adopted) killPid(adopted.pid);
      }
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
        const cleared = await clearStalePort(repoRoot);
        // Fail fast on a FOREIGN occupant: nothing of ours was cleared, no
        // healthy vaultspec engine answered, yet the port is taken. Aborting the
        // dev boot (rather than respawn-looping an unbindable engine) surfaces
        // the collision immediately — the locked-port / fail-fast contract.
        if (!cleared && (await portOccupied(port))) {
          throw new Error(
            `[engine] port ${port} is held by a non-vaultspec process. Free it, ` +
              `or set VAULTSPEC_DEV_PORT to an open port, then restart the dev server.`,
          );
        }
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
