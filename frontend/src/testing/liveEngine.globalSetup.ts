// Live-engine global setup (test-integrity: no mocks, no shadows).
//
// The frontend test suite runs ONLINE against the REAL `vaultspec serve`
// binary — never an in-memory double. This setup runs once before the whole
// vitest run: it copies the committed deterministic fixture vault
// (`fixtures/live-vault/`) into a scratch dir, makes it a git repo with fixed
// commit dates (so temporal/structural ingest is reproducible), spawns the
// real engine on a free loopback port scoped to that dir, waits for it to come
// up, and publishes `ENGINE_BASE_URL` / `ENGINE_TOKEN` for every test.
//
// Scratch isolation is load-bearing: the engine writes its SQLite cache under
// `<scope>/.vault/data/engine-data/`, so the test engine MUST own its own vault
// copy — it can never share the repo's real vault (that file is locked by the
// dev engine, production-vault-hardening). Teardown kills the engine and
// removes the scratch dir.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { awaitEngineQuiescent } from "./awaitEngineQuiescent";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures/live-vault");
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BIN_NAME = process.platform === "win32" ? "vaultspec.exe" : "vaultspec";

/** Resolve the engine binary the suite runs against (TIH-005).
 *
 *  An explicit `VAULTSPEC_TEST_ENGINE_BIN` override wins first — the same
 *  adopt-what-you're-told discipline as `ENGINE_BASE_URL`, so a developer can
 *  pin the exact binary and never race an in-flight `cargo build`.
 *
 *  Otherwise pick the freshest of `engine/target/{release,debug}` by mtime:
 *  debug is current on a dev machine (the release copy is held open by the dev
 *  server), release is current in CI. The chosen path + source is logged in the
 *  setup banner so a mismatch (a half-linked or stale binary) is visible in the
 *  first line of a failing run. */
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

const { path: ENGINE_BIN, source: ENGINE_BIN_SOURCE } = resolveEngineBin();

// Fixed commit identity + dates: the fixture's git history is the engine's
// temporal source, so reproducible dates make asof/diff windows deterministic.
const GIT_DATE = "2026-01-06T12:00:00";
const GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@vaultspec.test",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@vaultspec.test",
  GIT_AUTHOR_DATE: GIT_DATE,
  GIT_COMMITTER_DATE: GIT_DATE,
};

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

function git(scratch: string, args: string[]): void {
  const r = spawnSync("git", args, {
    cwd: scratch,
    env: { ...process.env, ...GIT_ENV },
  });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${r.stderr?.toString() ?? r.status}`,
    );
  }
}

let engine: ChildProcess | undefined;
let scratch: string | undefined;
let degradedScratch: string | undefined;

export default async function setup(): Promise<() => void> {
  // Adopt an externally-provided live engine (a CI job, a local `vaultspec
  // serve`) rather than spawning a second one — same online-live-surface
  // contract, no port/cache contention.
  if (process.env["ENGINE_BASE_URL"]) return () => {};

  // 1. Scratch copy of the fixture vault (owns its own engine-data cache).
  scratch = mkdtempSync(join(tmpdir(), "vaultspec-livetest-"));
  cpSync(join(FIXTURE_DIR, ".vault"), join(scratch, ".vault"), { recursive: true });

  // 2. Initialise it as a real vaultspec workspace so the engine's `declared`
  //    tier (vaultspec-core) comes up — content reads, vault-tree, and the
  //    editor write seam all route through it. The workspace scaffolding is
  //    generated fresh (not committed) so nothing machine-specific ships in the
  //    fixture; vaultspec-core is on PATH (the engine spawns it the same way).
  const install = spawnSync("vaultspec-core", ["install", "--target", scratch], {
    stdio: "pipe",
    shell: true,
  });
  if (install.status !== 0) {
    throw new Error(
      `vaultspec-core install failed (${install.status}): ${install.stderr?.toString() ?? ""}`,
    );
  }

  // 3. Real git history — the engine's structural + temporal ingest source.
  git(scratch, ["init", "-q", "-b", "main"]);
  git(scratch, ["add", "-A"]);
  git(scratch, ["commit", "-qm", "fixture corpus"]);

  // 3b. A degraded sibling worktree: it keeps `.vault/` (so the structural +
  //     temporal tiers still read the corpus and the graph loads) but DROPS
  //     `.vaultspec/`, so the declared tier (vaultspec-core) is genuinely down —
  //     a REAL degraded scope for the degradation-state tests, never a stub.
  degradedScratch = `${scratch}-degraded`;
  git(scratch, ["worktree", "add", "-q", "-b", "degraded-scope", degradedScratch]);
  rmSync(join(degradedScratch, ".vaultspec"), { recursive: true, force: true });
  git(degradedScratch, ["add", "-A"]);
  git(degradedScratch, [
    "commit",
    "-qm",
    "degraded scope: vault without a vaultspec workspace",
  ]);

  // 3. Spawn the real engine on a free loopback port, scoped to the scratch dir.
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  // Banner (TIH-005): make the exact binary under test visible in the first
  // lines of a run so a stale / half-linked / overridden binary is diagnosable.
  console.info(
    `[live-engine] binary: ${ENGINE_BIN} (source: ${ENGINE_BIN_SOURCE}) → ${baseUrl}`,
  );
  engine = spawn(ENGINE_BIN, ["serve", "--port", String(port)], {
    cwd: scratch,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serveLog = "";
  engine.stdout?.on("data", (d: Buffer) => (serveLog += d.toString()));
  engine.stderr?.on("data", (d: Buffer) => (serveLog += d.toString()));

  // 4. Read the rotated service token + poll /status until the engine answers.
  const tokenPath = join(scratch, ".vault", "data", "engine-data", "service.json");
  const deadline = Date.now() + 30_000;
  let token = "";
  let ready = false;
  while (Date.now() < deadline) {
    if (engine.exitCode !== null) {
      throw new Error(
        `engine exited (${engine.exitCode}) during startup:\n${serveLog}`,
      );
    }
    if (!token) {
      try {
        token = (
          JSON.parse(readFileSync(tokenPath, "utf8")) as { service_token?: string }
        ).service_token!;
      } catch {
        /* not written yet */
      }
    }
    if (token) {
      try {
        const res = await fetch(`${baseUrl}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* not listening yet */
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error(`engine did not come up within 30s:\n${serveLog}`);

  // Wait for the COLD ingest to settle before any test runs (TIH-003 / TIH-006): the
  // engine answers /status the moment it binds, but its initial declared-fold graph
  // rebuild is still in flight for a beat after. Publishing env now would let file 1
  // start reading a mid-fold corpus. Block until the graph `generation` is stable.
  try {
    await awaitEngineQuiescent({ baseUrl, token });
  } catch (err) {
    throw new Error(
      `engine came up but did not reach quiescence:\n${(err as Error).message}\n${serveLog}`,
      { cause: err },
    );
  }

  process.env["ENGINE_BASE_URL"] = baseUrl;
  process.env["ENGINE_TOKEN"] = token;

  return () => {
    if (engine?.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(engine.pid), "/T", "/F"]);
      } else {
        engine.kill("SIGKILL");
      }
    }
    if (degradedScratch) rmSync(degradedScratch, { recursive: true, force: true });
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  };
}
