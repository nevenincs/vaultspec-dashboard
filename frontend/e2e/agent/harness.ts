// Cross-repository agent e2e harness: boots the real dashboard engine and the
// real a2a gateway as two independently owned processes. The engine ATTACHES to
// a2a through the resident service record under `VAULTSPEC_A2A_HOME`; a2a gets
// the engine's own freshly-published workspace service record through
// `VAULTSPEC_ENGINE_SERVICE_JSON`. Nothing here fabricates either record or
// replaces either transport.
//
// The source checkout is explicit because this is a staged, environment-gated
// lane (W02.P04.S09 owns the skip/reporting contract). `uv run --no-sync` uses
// the pinned checkout's already-provisioned environment without creating or
// mutating an environment in either source or scratch space.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  forceTerminateProcessTree,
  resolveExecutable,
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
const ATTACHMENT_TIMEOUT_MS = 150_000;
const WORKER_READY_TIMEOUT_SECONDS = 120;
const POLL_INTERVAL_MS = 200;
const MAX_A2A_LOG_BYTES = 1024 * 1024;

export interface A2aHandle {
  readonly proc: ChildProcess;
  readonly baseUrl: string;
  readonly serviceJson: string;
  readonly attachToken: string;
  readonly gatewayPid: number;
  readonly diagnostics: () => string;
  /** Persist bounded, non-secret test evidence before this harness removes its
   * scratch home during teardown. */
  readonly retainDiagnostics: (evidence: object) => string;
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
  readonly pid?: unknown;
  readonly port?: unknown;
  readonly handoff_reference?: unknown;
}

interface A2aServiceState {
  readonly worker_ready?: unknown;
  readonly can_accept_run?: unknown;
  readonly degraded_reasons?: unknown;
}

export interface ProviderCatalogSelection {
  readonly schema_version: 1;
  readonly provider_id: string;
  readonly execution_mode: string;
  readonly catalog_revision: string;
  readonly entry_id: string;
  readonly controls: Readonly<Record<string, string>>;
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

function readLogTail(path: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const size = statSync(path).size;
    const length = Math.min(size, MAX_A2A_LOG_BYTES);
    const start = size - length;
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(
        descriptor,
        buffer,
        offset,
        length - offset,
        start + offset,
      );
      if (count === 0) break;
      offset += count;
    }
    return buffer.subarray(0, offset).toString();
  } catch {
    return "";
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));
}

function childFailure(proc: ChildProcess, log: string, stage: string): Error {
  return new Error(
    `a2a exited (${proc.exitCode ?? proc.signalCode ?? "unknown"}) during ${stage}:\n${log}`,
  );
}

function gatewayDiagnostics(log: string, appHome: string, workerPort: number): string {
  const stderrPath = join(
    appHome,
    "runtime",
    `worker-autospawn-${workerPort}.stderr.log`,
  );
  const workerStderr = readLogTail(stderrPath);
  return workerStderr ? `${log}\nworker stderr (${stderrPath}):\n${workerStderr}` : log;
}

function retainDiagnostics(
  log: string,
  appHome: string,
  workerPort: number,
  evidence: object,
): string {
  // Playwright's test-result directory outlives this scratch A2A home. Keep
  // only relay/status evidence supplied by the test plus capped child output;
  // credentials and the spawned environment never enter this artifact.
  const directory = join(process.cwd(), "test-results", "agent-runtime");
  mkdirSync(directory, { recursive: true });
  const path = join(
    directory,
    `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}.json`,
  );
  writeFileSync(
    path,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        evidence,
        diagnostics: gatewayDiagnostics(log, appHome, workerPort),
      },
      null,
      2,
    ),
  );
  return path;
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
    // The source gateway has no desktop-minted IPC credential. Its explicit
    // scratch-only development profile makes the internal-auth configuration
    // deliberate rather than silently accepting an undeclared environment.
    VAULTSPEC_ENVIRONMENT: "development",
    // Keep the real internal bearer boundary exercised even in this source
    // development profile. The gateway passes this fresh secret only to its
    // worker child; it never enters diagnostics or a service record.
    VAULTSPEC_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
    VAULTSPEC_ENGINE_SERVICE_JSON: engineServiceJson,
    VAULTSPEC_HOST: "127.0.0.1",
    VAULTSPEC_PORT: String(gatewayPort),
    VAULTSPEC_WORKER_HOST: "127.0.0.1",
    VAULTSPEC_WORKER_PORT: String(workerPort),
    VAULTSPEC_WORKER_READY_TIMEOUT_SECONDS: String(WORKER_READY_TIMEOUT_SECONDS),
    VAULTSPEC_MCP_HOST: "127.0.0.1",
    VAULTSPEC_MCP_PORT: String(mcpPort),
    VAULTSPEC_DATABASE_BACKEND: "sqlite",
    VAULTSPEC_CHECKPOINT_BACKEND: "sqlite",
    VAULTSPEC_DATABASE_URL: sqliteUrl(join(appHome, "gateway.sqlite3")),
    VAULTSPEC_CHECKPOINT_DATABASE_URL: sqliteUrl(join(appHome, "checkpoints.sqlite3")),
    // This certification lane must use the non-billable deterministic provider.
    // In-process lanes are otherwise deliberately hidden in normal serving.
    VAULTSPEC_SERVE_IN_PROCESS_LANES: "true",
  });

  const proc = spawn(
    "uv",
    [
      "run",
      "--no-sync",
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
  let publishedGatewayPid: number | undefined;
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
        const gatewayPid = record.pid;
        const handoffReference = record.handoff_reference;
        if (
          typeof port === "number" &&
          Number.isInteger(port) &&
          port > 0 &&
          typeof gatewayPid === "number" &&
          Number.isSafeInteger(gatewayPid) &&
          gatewayPid > 0 &&
          typeof handoffReference === "string"
        ) {
          publishedGatewayPid = gatewayPid;
          const baseUrl = `http://127.0.0.1:${port}`;
          const attachToken = readFileSync(handoffReference, "utf8").trim();
          if (!attachToken) throw new Error("a2a handoff token is empty");
          const response = await fetch(`${baseUrl}/health`, {
            signal: AbortSignal.timeout(2_000),
          });
          if (response.ok)
            return {
              proc,
              baseUrl,
              serviceJson,
              attachToken,
              gatewayPid,
              diagnostics: () => gatewayDiagnostics(log, appHome, workerPort),
              retainDiagnostics: (evidence) =>
                retainDiagnostics(log, appHome, workerPort, evidence),
            };
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
      await stopA2a({ proc, gatewayPid: publishedGatewayPid });
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "a2a startup and cleanup both failed",
        { cause: startupError }, // eslint-disable-line preserve-caught-error
      );
    }
    throw startupError;
  }
}

async function waitForA2aWorker(handle: A2aHandle): Promise<void> {
  const deadline = Date.now() + ATTACHMENT_TIMEOUT_MS;
  let lastFailure = "a2a service-state has not answered";
  while (Date.now() < deadline) {
    if (handle.proc.exitCode !== null || handle.proc.signalCode !== null) {
      throw childFailure(handle.proc, handle.diagnostics(), "worker readiness");
    }
    try {
      const response = await fetch(`${handle.baseUrl}/v1/service`, {
        headers: { Authorization: `Bearer ${handle.attachToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      const raw = await response.text();
      if (response.ok) {
        const state = JSON.parse(raw) as A2aServiceState;
        if (state.worker_ready === true && state.can_accept_run === true) return;
        lastFailure = `worker_ready=${String(state.worker_ready)}, can_accept_run=${String(state.can_accept_run)}, degraded_reasons=${JSON.stringify(state.degraded_reasons)}`;
      } else {
        lastFailure = `service-state returned ${response.status}: ${raw}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(
    `a2a worker did not become production-ready within ${ATTACHMENT_TIMEOUT_MS / 1000}s: ${lastFailure}\n${handle.diagnostics()}`,
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Mint a run selection only from the gateway's current, engine-brokered catalog.
 * The deterministic lane is intentional: this suite must never spend against a
 * developer's configured provider merely because it is currently selectable. */
export async function currentDeterministicSelection(
  engine: EngineHandle,
  expectedScope: string,
): Promise<ProviderCatalogSelection> {
  const response = await fetch(`${engine.baseUrl}/ops/a2a/provider-catalog`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${engine.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expected_scope: expectedScope }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `provider-catalog failed through the engine (${response.status}): ${raw}`,
    );
  }
  const envelope = record(record(JSON.parse(raw))?.data)?.envelope;
  const providers = record(envelope)?.providers;
  if (!Array.isArray(providers)) {
    throw new Error("provider-catalog returned no providers envelope");
  }
  const lane = providers
    .map(record)
    .find(
      (candidate) =>
        candidate?.provider_id === "deterministic" &&
        candidate.execution_mode === "in-process-deterministic" &&
        record(candidate.health)?.selectable === true,
    );
  const catalog = lane && record(lane.catalog);
  const state = catalog && record(catalog.state);
  const models = catalog?.models;
  const entry = Array.isArray(models)
    ? models.map(record).find((candidate) => typeof candidate?.entry_id === "string")
    : undefined;
  if (
    !lane ||
    typeof state?.revision !== "string" ||
    typeof entry?.entry_id !== "string"
  ) {
    throw new Error("provider-catalog did not serve a selectable deterministic lane");
  }
  const controls: Record<string, string> = {};
  const nativeControlIds = entry.native_control_ids;
  const nativeControls = catalog?.native_controls;
  if (Array.isArray(nativeControlIds) && Array.isArray(nativeControls)) {
    for (const controlId of nativeControlIds) {
      if (typeof controlId !== "string") continue;
      const control = nativeControls
        .map(record)
        .find((candidate) => candidate?.control_id === controlId);
      if (
        control &&
        typeof control.default_option_id === "string" &&
        Array.isArray(control.options) &&
        control.options.some(
          (option) => record(option)?.option_id === control.default_option_id,
        )
      ) {
        controls[controlId] = control.default_option_id;
      }
    }
  }
  return {
    schema_version: 1,
    provider_id: "deterministic",
    execution_mode: "in-process-deterministic",
    catalog_revision: state.revision,
    entry_id: entry.entry_id,
    controls,
  };
}

async function warmLazyWorker(engine: EngineHandle, a2a: A2aHandle): Promise<void> {
  const session = await fetch(`${engine.baseUrl}/session`, {
    headers: { authorization: `Bearer ${engine.token}` },
    signal: AbortSignal.timeout(5_000),
  });
  const sessionRaw = await session.text();
  if (!session.ok) {
    throw new Error(
      `engine session read failed while warming the lazy worker (${session.status}): ${sessionRaw}`,
    );
  }
  const expectedScope = (
    JSON.parse(sessionRaw) as { data?: { active_scope?: unknown } }
  ).data?.active_scope;
  if (typeof expectedScope !== "string") {
    throw new Error(
      "engine session did not return an active scope for lazy-worker warmup",
    );
  }
  const selection = await currentDeterministicSelection(engine, expectedScope);

  const runId = `e2e-worker-warmup-${crypto.randomUUID().replaceAll("-", "")}`;
  const post = async (verb: string, body: object) => {
    const response = await fetch(`${engine.baseUrl}/ops/a2a/${verb}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${engine.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `${verb} failed through the engine while warming the lazy worker (${response.status}): ${raw}\nowned a2a diagnostics:\n${a2a.diagnostics()}`,
      );
    }
    return JSON.parse(raw) as { data?: { envelope?: unknown } };
  };

  // The engine exposes its one-shot run-start contract to this adapter. Wait
  // until the real run is active before canceling: the cancellation lifecycle
  // needs a dispatched worker to provide its terminal cessation evidence.
  await post("run-start", {
    run_id: runId,
    team_preset: "deterministic-cancel-window",
    message: "warm the real lazy worker before the relay scenarios",
    expected_scope: expectedScope,
    selection,
    autonomous: true,
  });

  const deadline = Date.now() + 60_000;
  let latestStatus: unknown;
  const observedStatuses: string[] = [];
  const readAuthoritativeStatus = (
    response: { data?: { envelope?: unknown } },
    phase: string,
  ): string => {
    latestStatus = record(response.data?.envelope)?.status;
    const statusName =
      typeof latestStatus === "string"
        ? latestStatus.toLowerCase()
        : String(latestStatus).toLowerCase();
    observedStatuses.push(String(latestStatus));
    if (statusName === "reconciling") {
      throw new Error(
        `lazy-worker warmup observed RECONCILING ${phase}; statuses: ${observedStatuses.join(" -> ")}\nowned a2a diagnostics:\n${a2a.diagnostics()}`,
      );
    }
    return statusName;
  };
  let runningObserved = false;
  while (Date.now() < deadline) {
    const status = await post("run-status", { run_id: runId });
    const statusName = readAuthoritativeStatus(status, "before RUNNING");
    if (statusName === "running") {
      runningObserved = true;
      break;
    }
    if (["completed", "cancelled", "failed"].includes(statusName)) {
      throw new Error(
        `lazy-worker warmup reached terminal ${String(latestStatus)} before authoritative RUNNING; statuses: ${observedStatuses.join(" -> ")}\nowned a2a diagnostics:\n${a2a.diagnostics()}`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (!runningObserved) {
    throw new Error(
      `lazy-worker warmup did not become authoritative RUNNING: ${String(latestStatus)}; statuses: ${observedStatuses.join(" -> ")}\nowned a2a diagnostics:\n${a2a.diagnostics()}`,
    );
  }

  await post("run-cancel", { run_id: runId });
  while (Date.now() < deadline) {
    const status = await post("run-status", { run_id: runId });
    const statusName = readAuthoritativeStatus(status, "after cancellation");
    if (statusName === "cancelled") return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `lazy-worker warmup run did not settle as cancelled: ${String(latestStatus)}; statuses: ${observedStatuses.join(" -> ")}\nowned a2a diagnostics:\n${a2a.diagnostics()}`,
  );
}

/** Stop the exact process tree this harness launched. A plain source `serve`
 * has no lifecycle capability, so the trusted bounded tree terminator is the
 * authoritative teardown rather than pretending the product-managed admin stop
 * is available. */
export async function stopA2a(
  handle: Pick<A2aHandle, "proc"> & Partial<Pick<A2aHandle, "gatewayPid">>,
): Promise<void> {
  const launcherRunning =
    handle.proc.exitCode === null && handle.proc.signalCode === null;
  if (launcherRunning) {
    try {
      forceTerminateProcessTree(handle.proc);
    } catch (error) {
      // The owned gateway can finish between the liveness check above and
      // taskkill opening its process handle. That is already the requested
      // postcondition; preserve real termination failures only while it stays live.
      if (!(await waitForChildExit(handle.proc, 10_000))) throw error;
    }
    if (!(await waitForChildExit(handle.proc, 10_000))) {
      throw new Error(`a2a process ${handle.proc.pid} did not exit after tree stop`);
    }
  }

  // On Windows, `uv run` can exit after its child has published the fresh
  // scratch-scoped service record. Its process tree is then no longer reachable
  // through the launcher handle, so use only that record's just-validated PID.
  // A brand-new mkdtemp root makes this an owned target rather than a service
  // discovery sweep; taskkill's tree mode reaps its worker descendant as well.
  if (process.platform === "win32" && handle.gatewayPid !== undefined) {
    const taskkill = resolveExecutable("taskkill");
    const result = spawnSync(
      taskkill,
      ["/pid", String(handle.gatewayPid), "/T", "/F"],
      { stdio: "pipe", timeout: 5_000 },
    );
    const output = `${result.stdout?.toString() ?? ""}\n${result.stderr?.toString() ?? ""}`;
    if (
      result.error ||
      (result.status !== 0 && !/not found|not running/i.test(output))
    ) {
      throw new Error(
        `taskkill failed for owned a2a gateway ${handle.gatewayPid}: ${result.error?.message ?? output}`,
      );
    }
  }
}

async function waitForEngineAttachment(engine: EngineHandle): Promise<void> {
  const deadline = Date.now() + ATTACHMENT_TIMEOUT_MS;
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

/** Remove each root this harness owns, even if its sibling removal failed.
 *
 * Both roots are created only for this harness. Keeping their failure handling
 * separate preserves the recovery path on Windows, where a just-exited child
 * can transiently retain one handle while the other root is immediately safe
 * to remove.
 */
function removeOwnedRoots(
  a2aHome: string | undefined,
  fixture: FixtureWorktree | undefined,
): unknown[] {
  const failures: unknown[] = [];
  if (a2aHome) {
    try {
      rmSync(a2aHome, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (fixture) {
    try {
      removeFixtureWorktree(fixture.root);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

/**
 * Start a real engine over a fresh git worktree, then a real a2a source gateway
 * over a fresh application home. The final read is deliberately engine-origin
 * only: successful `presets-list` proves the engine discovered the resident
 * record and reached a2a through the production attach-never-own transport.
 */
export async function startAgentHarness(): Promise<AgentHarness> {
  const a2aRoot = resolveA2aRoot();
  let fixture: FixtureWorktree | undefined;
  let a2aHome: string | undefined;
  let engine: EngineHandle | undefined;
  let a2a: A2aHandle | undefined;
  try {
    fixture = createFixtureWorktree();
    a2aHome = mkdtempSync(join(tmpdir(), "vaultspec-a2a-e2e-"));
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
    await warmLazyWorker(engine, a2a);
    await waitForA2aWorker(a2a);
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
    failures.push(...removeOwnedRoots(a2aHome, fixture));
    if (failures.length > 1) {
      throw new AggregateError(failures, "agent harness startup and cleanup failed", {
        cause: startupError,
      });
    }
    throw startupError;
  }

  if (!fixture || !a2aHome || !engine || !a2a) {
    throw new Error("agent harness startup returned without every owned resource");
  }

  let stopped = false;
  return {
    fixture,
    engine,
    a2a,
    a2aHome,
    async stop(): Promise<void> {
      if (stopped) return;
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
      failures.push(...removeOwnedRoots(a2aHome, fixture));
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(failures, "agent harness cleanup failed");
      }
      stopped = true;
    },
  };
}
