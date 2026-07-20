// Authoring e2e engine harness (W14.P42 S207/S208): spawns a REAL `vaultspec
// serve` binary — never a mock — scoped to its own scratch git worktree, so the
// restart/replay/reconnect and security-negative scenarios in `authoring.spec.ts`
// exercise the genuine wire end to end without touching the shared main
// worktree's `vaultspec serve` (which other sessions/agents keep live over the
// real `.vault/`).
//
// Structurally this mirrors `frontend/src/testing/liveEngine.globalSetup.ts`
// (same binary-resolution, same spawn/poll/service.json recipe) with one
// addition this suite needs that the vitest harness does not: `restartEngine`,
// which kills the process and respawns it against the SAME scratch directory so
// the durable authoring store (`.vault/data/authoring-state/`) is proven to
// survive a genuine backend restart — the S208 scenario this harness exists for.
//
// Port choice: an OS-assigned free port, not a pinned `dev-ports.ts` entry. The
// dev-ports rule reserves the ephemeral-port exception for exactly this shape of
// process — an automated, scratch-scoped, torn-down-per-run test engine — citing
// the vitest harness as the one instance; this is the second.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  forceTerminateProcessTree,
  waitForChildExit,
} from "../../src/testing/processControl";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BIN_NAME = process.platform === "win32" ? "vaultspec.exe" : "vaultspec";
const COMMAND_TIMEOUT_MS = 60_000;
const MAX_ENGINE_LOG_BYTES = 1024 * 1024;

const GIT_DATE = "2026-01-06T12:00:00";
const GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@vaultspec.test",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@vaultspec.test",
  GIT_AUTHOR_DATE: GIT_DATE,
  GIT_COMMITTER_DATE: GIT_DATE,
};

/** One authoring-target document seeded into the scratch worktree. */
export interface FixtureDoc {
  readonly nodeId: string;
  readonly stem: string;
  readonly path: string;
  readonly docType: string;
}

export const DOC_ONE: FixtureDoc = {
  nodeId: "doc:e2e-authoring-one",
  stem: "e2e-authoring-one",
  path: ".vault/plan/e2e-authoring-one.md",
  docType: "plan",
};

export const DOC_TWO: FixtureDoc = {
  nodeId: "doc:e2e-authoring-two",
  stem: "e2e-authoring-two",
  path: ".vault/plan/e2e-authoring-two.md",
  docType: "plan",
};

const BASE_BODY = (title: string): string =>
  `---\ntags:\n  - '#plan'\n  - '#e2e-authoring'\ndate: '2026-01-06'\n---\n\n# ${title}\n\nbase body\n`;

/** Resolve the engine binary under test (TIH-005 parity with the vitest harness):
 *  an explicit override wins, else the freshest of `engine/target/{release,debug}`. */
function resolveEngineBin(): { path: string; source: string } {
  const override = process.env["VAULTSPEC_TEST_ENGINE_BIN"];
  if (override) {
    try {
      statSync(override);
    } catch {
      throw new Error(
        `VAULTSPEC_TEST_ENGINE_BIN points at a missing binary: ${override}`,
      );
    }
    return { path: override, source: "VAULTSPEC_TEST_ENGINE_BIN" };
  }
  const candidates = ["release", "debug"].map((profile) => ({
    profile,
    path: join(REPO_ROOT, "engine", "target", profile, BIN_NAME),
  }));
  const built = candidates
    .map(({ profile, path }) => {
      try {
        return { profile, path, mtime: statSync(path).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter(
      (c): c is { profile: string; path: string; mtime: number } => c !== undefined,
    )
    .sort((a, b) => b.mtime - a.mtime);
  if (built.length === 0) {
    throw new Error(
      `no vaultspec engine binary found under engine/target/{release,debug}/ — run \`cargo build\` first`,
    );
  }
  return { path: built[0].path, source: `mtime:${built[0].profile}` };
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

export function git(dir: string, args: string[]): void {
  const r = spawnSync("git", args, {
    cwd: dir,
    env: { ...process.env, ...GIT_ENV },
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${r.error?.message ?? r.stderr?.toString() ?? r.status}`,
    );
  }
}

export function gitBlob(dir: string, rel: string): string {
  const r = spawnSync("git", ["hash-object", rel], {
    cwd: dir,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (r.error || r.status !== 0) {
    throw new Error(
      `git hash-object ${rel} failed: ${r.error?.message ?? r.stderr?.toString() ?? r.status}`,
    );
  }
  return `blob:${r.stdout.toString().trim()}`;
}

/** A real git worktree seeded with two committed plan docs, mirroring the
 *  wire-level Rust acceptance fixture (`authoring_p42a_acceptance.rs`
 *  `worktree_state`) — the closest existing precedent for a no-core,
 *  no-`.vaultspec/` authoring fixture. Returns the scratch root and each doc's
 *  base revision (a real git blob hash, computed the same way the apply/conflict
 *  routes compute it). */
export interface FixtureWorktree {
  readonly root: string;
  readonly baseOf: (doc: FixtureDoc) => string;
}

export function createFixtureWorktree(): FixtureWorktree {
  const root = mkdtempSync(join(tmpdir(), "vaultspec-authoring-e2e-"));
  for (const doc of [DOC_ONE, DOC_TWO]) {
    const p = join(root, ...doc.path.split("/"));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, BASE_BODY(doc.stem));
  }
  writeFileSync(
    join(root, ".gitignore"),
    ".vault/data/\n.vault/logs/\n.vault/.obsidian/\n.vault/.trash/\n",
  );
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "e2e authoring fixture"]);
  return { root, baseOf: (doc) => gitBlob(root, doc.path) };
}

export interface EngineHandle {
  readonly proc: ChildProcess;
  readonly port: number;
  readonly baseUrl: string;
  readonly token: string;
}

/** Spawn the real engine over `root`, waiting for `service.json` + a live
 *  `/status` before returning. */
export async function spawnEngine(root: string): Promise<EngineHandle> {
  const { path: bin } = resolveEngineBin();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(bin, ["serve", "--port", String(port), "--no-seat"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let log = "";
  const appendLog = (d: Buffer): void => {
    log = (log + d.toString()).slice(-MAX_ENGINE_LOG_BYTES);
  };
  proc.stdout?.on("data", appendLog);
  proc.stderr?.on("data", appendLog);

  const tokenPath = join(root, ".vault", "data", "engine-data", "service.json");
  const deadline = Date.now() + 30_000;
  let token = "";
  let ready = false;
  try {
    while (Date.now() < deadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        throw new Error(`engine exited (${proc.exitCode}) during startup:\n${log}`);
      }
      // Re-read every tick (never cache-once): on a restart the tokenPath already
      // holds the PREVIOUS process's stale token until this process's own boot
      // overwrites it, so caching the first successful parse risks locking onto a
      // dead credential and polling `/status` with it until the deadline.
      try {
        token = (
          JSON.parse(readFileSync(tokenPath, "utf8")) as {
            service_token?: string;
          }
        ).service_token!;
      } catch {
        /* not written yet */
      }
      if (token) {
        try {
          const res = await fetch(`${baseUrl}/status`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(2_000),
          });
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          /* not listening yet */
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!ready) throw new Error(`engine did not come up within 30s:\n${log}`);
    return { proc, port, baseUrl, token };
  } catch (startupError) {
    try {
      await killProcess(proc);
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "authoring engine startup and cleanup both failed",
      );
    }
    throw startupError;
  }
}

async function killProcess(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null || !proc.pid) return;
  forceTerminateProcessTree(proc);
  if (!(await waitForChildExit(proc, 5_000))) {
    throw new Error(`engine process ${proc.pid} did not exit after force stop`);
  }
}

/** S208 — kill the running engine and respawn it against the SAME scratch
 *  worktree (a fresh port + a freshly-rotated service token, exactly like a real
 *  process restart), proving the durable authoring store on disk survives. */
export async function restartEngine(
  root: string,
  handle: EngineHandle,
): Promise<EngineHandle> {
  await killProcess(handle.proc);
  return spawnEngine(root);
}

export async function stopEngine(handle: EngineHandle): Promise<void> {
  if (handle.proc.exitCode !== null || handle.proc.signalCode !== null) return;
  try {
    const response = await fetch(`${handle.baseUrl}/shutdown`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${handle.token}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    await response.arrayBuffer();
  } catch {
    // The bounded exit wait and force fallback below own final cleanup.
  }
  if (!(await waitForChildExit(handle.proc, 10_000))) {
    await killProcess(handle.proc);
  }
}

export function removeFixtureWorktree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
