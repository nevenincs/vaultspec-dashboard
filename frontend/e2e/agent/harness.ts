// Cross-repository agent e2e harness: boots the real dashboard engine and the
// real a2a gateway as two independently owned processes. The engine ATTACHES to
// a2a through the resident service record under `VAULTSPEC_A2A_HOME`; a2a gets
// the engine's own freshly-published workspace service record through
// `VAULTSPEC_ENGINE_SERVICE_JSON`. Nothing here fabricates either record or
// replaces either transport.
//
// The source checkout is explicit because this is a staged, environment-gated
// lane (W02.P04.S09 owns the skip/reporting contract). `UV_PROJECT_ENVIRONMENT`
// deliberately points into this harness's scratch home so `uv run` cannot
// create or mutate `.venv` in the shared a2a worktree.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  forceTerminateProcessTree,
  waitForChildExit,
} from "../../src/testing/processControl";
import {
  type EngineHandle,
  type FixtureWorktree,
  createFixtureWorktree,
  removeFixtureWorktree,
  spawnEngine,
  stopEngine,
} from "../authoring/engine";

const A2A_ROOT_ENV = "VAULTSPEC_TEST_A2A_ROOT";
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 200;
const MAX_A2A_LOG_BYTES = 1024 * 1024;

export interface A2aHandle {
  readonly proc: ChildProcess;
  readonly baseUrl: string;
  readonly serviceJson: string;
}

/** The complete, scratch-scoped two-process lane. Call `stop()` exactly once in
 * the suite teardown; it stops both owned process trees before removing either
 * scratch root. */
export interface AgentHarness {
  readonly fixture: FixtureWorktree;
  readonly engine: EngineHandle;
  readonly a2a: A2aHandle;
  readonly a2aHome: string;
  stop(): Promise<void>;
}

interface A2aServiceRecord {
  readonly port?: unknown;
}

function resolveA2aRoot(): string {
  const configured = process.env[A2A_ROOT_ENV];
  if (!configured) {
    throw new Error(
      `${A2A_ROOT_ENV} is required: set it to the pinned vaultspec-a2a source checkout`,
    );
  }
  const root = resolve(configured);
  const manifest = join(root, "pyproject.toml");
  try {
    if (!statSync(manifest).isFile()) {
      throw new Error(`${manifest} is not a file`);
    }
  } catch (error) {
    throw new Error(
      `${A2A_ROOT_ENV} must name an a2a source checkout with pyproject.toml: ${root}`,
      { cause: error },
    );
  }
  return root;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function sqliteUrl(path: string): string {
  return `sqlite+aiosqlite:///${path.replaceAll("\\", "/")}`;
}

function appendLog(current: string, chunk: Buffer): string {
  const combined = current + chunk.toString();
  return combined.length <= MAX_A2A_LOG_BYTES
    ? combined
    : combined.slice(-MAX_A2A_LOG_BYTES);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));
}

function childFailure(proc: ChildProcess, log: string, stage: string): Error {
  return new Error(
    `a2a exited (${proc.exitCode ?? proc.signalCode ?? "unknown"}) during ${stage}:\n${log}`,
  );
}

async function spawnA2a(
  root: string,
  appHome: string,
  engineServiceJson: string,
): Promise<A2aHandle> {
  const [gatewayPort, workerPort, mcpPort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
  ]);
  const serviceJson = join(appHome, "service.json");
  const environment: NodeJS.ProcessEnv = { ...process.env };
  // A regular source `serve` is intentionally not desktop-armed. An inherited
  // desktop profile would redirect the gateway's state away from this scratch
  // home and invalidate the discovery proof.
  delete environment["VAULTSPEC_DESKTOP_APP_HOME"];
  delete environment["VAULTSPEC_CAPSULE_ASSETS"];
  Object.assign(environment, {
    VAULTSPEC_A2A_HOME: appHome,
    VAULTSPEC_ENGINE_SERVICE_JSON: engineServiceJson,
    VAULTSPEC_HOST: "127.0.0.1",
    VAULTSPEC_PORT: String(gatewayPort),
    VAULTSPEC_WORKER_HOST: "127.0.0.1",
    VAULTSPEC_WORKER_PORT: String(workerPort),
    VAULTSPEC_MCP_HOST: "127.0.0.1",
    VAULTSPEC_MCP_PORT: String(mcpPort),
    VAULTSPEC_DATABASE_BACKEND: "sqlite",
    VAULTSPEC_CHECKPOINT_BACKEND: "sqlite",
    VAULTSPEC_DATABASE_URL: sqliteUrl(join(appHome, "gateway.sqlite3")),
    VAULTSPEC_CHECKPOINT_DATABASE_URL: sqliteUrl(join(appHome, "checkpoints.sqlite3")),
    // Keep the source check-out read-only even when uv must construct a project
    // environment for this environment-gated lane.
    UV_PROJECT_ENVIRONMENT: join(appHome, "uv-environment"),
  });

  const proc = spawn(
    "uv",
    [
      "run",
      "--project",
      root,
      "--locked",
      "python",
      "-m",
      "vaultspec_a2a.cli.main",
      "serve",
    ],
    {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  let log = "";
  const capture = (chunk: Buffer): void => {
    log = appendLog(log, chunk);
  };
  proc.stdout?.on("data", capture);
  proc.stderr?.on("data", capture);

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        throw childFailure(proc, log, "startup");
      }
      try {
        const record = JSON.parse(
          readFileSync(serviceJson, "utf8"),
        ) as A2aServiceRecord;
        const port = record.port;
        if (typeof port === "number" && Number.isInteger(port) && port > 0) {
          const baseUrl = `http://127.0.0.1:${port}`;
          const response = await fetch(`${baseUrl}/health`, {
            signal: AbortSignal.timeout(2_000),
          });
          if (response.ok) return { proc, baseUrl, serviceJson };
        }
      } catch {
        // Discovery has not been atomically published yet, or the listener is
        // still becoming healthy. The deadline below remains the failure boundary.
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`a2a did not become discoverably healthy within 60s:\n${log}`);
  } catch (startupError) {
    try {
      await stopA2a({ proc, baseUrl: `http://127.0.0.1:${gatewayPort}`, serviceJson });
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "a2a startup and cleanup both failed",
      );
    }
    throw startupError;
  }
}

/** Stop the exact process tree this harness launched. A plain source `serve`
 * has no lifecycle capability, so the trusted bounded tree terminator is the
 * authoritative teardown rather than pretending the product-managed admin stop
 * is available. */
export async function stopA2a(handle: A2aHandle): Promise<void> {
  if (handle.proc.exitCode !== null || handle.proc.signalCode !== null) return;
  forceTerminateProcessTree(handle.proc);
  if (!(await waitForChildExit(handle.proc, 10_000))) {
    throw new Error(`a2a process ${handle.proc.pid} did not exit after tree stop`);
  }
}

async function waitForEngineAttachment(engine: EngineHandle): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastFailure = "engine has not answered the a2a presets read";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${engine.baseUrl}/ops/a2a/presets-list`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${engine.token}`,
          "content-type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(5_000),
      });
      const raw = await response.text();
      if (response.ok) {
        const parsed = JSON.parse(raw) as { data?: { envelope?: unknown } };
        if (parsed.data?.envelope !== undefined && parsed.data.envelope !== null)
          return;
        lastFailure = "engine response did not carry an a2a envelope";
      } else {
        lastFailure = `engine presets read returned ${response.status}: ${raw}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `engine did not attach to the discovered a2a gateway: ${lastFailure}`,
  );
}

/**
 * Start a real engine over a fresh git worktree, then a real a2a source gateway
 * over a fresh application home. The final read is deliberately engine-origin
 * only: successful `presets-list` proves the engine discovered the resident
 * record and reached a2a through the production attach-never-own transport.
 */
export async function startAgentHarness(): Promise<AgentHarness> {
  const a2aRoot = resolveA2aRoot();
  const fixture = createFixtureWorktree();
  const a2aHome = mkdtempSync(join(tmpdir(), "vaultspec-a2a-e2e-"));
  let engine: EngineHandle | undefined;
  let a2a: A2aHandle | undefined;
  try {
    engine = await spawnEngine(fixture.root, { VAULTSPEC_A2A_HOME: a2aHome });
    const engineServiceJson = join(
      fixture.root,
      ".vault",
      "data",
      "engine-data",
      "service.json",
    );
    if (!existsSync(engineServiceJson)) {
      throw new Error(
        `engine did not publish its discovery record: ${engineServiceJson}`,
      );
    }
    a2a = await spawnA2a(a2aRoot, a2aHome, engineServiceJson);
    await waitForEngineAttachment(engine);
  } catch (startupError) {
    const failures: unknown[] = [startupError];
    if (a2a) {
      try {
        await stopA2a(a2a);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (engine) {
      try {
        await stopEngine(engine);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    try {
      rmSync(a2aHome, { recursive: true, force: true });
      removeFixtureWorktree(fixture.root);
    } catch (cleanupError) {
      failures.push(cleanupError);
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "agent harness startup and cleanup failed");
    }
    throw startupError;
  }

  let stopped = false;
  return {
    fixture,
    engine,
    a2a,
    a2aHome,
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      const failures: unknown[] = [];
      try {
        await stopA2a(a2a);
      } catch (error) {
        failures.push(error);
      }
      try {
        await stopEngine(engine);
      } catch (error) {
        failures.push(error);
      }
      try {
        rmSync(a2aHome, { recursive: true, force: true });
        removeFixtureWorktree(fixture.root);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(failures, "agent harness cleanup failed");
      }
    },
  };
}
