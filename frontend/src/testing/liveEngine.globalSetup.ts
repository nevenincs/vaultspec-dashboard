// Global setup for tests that exercise `vaultspec serve`. It copies the
// committed deterministic fixture corpus
// (`fixtures/live-vault/`) into a scratch dir, makes it a git repo with fixed
// commit dates (so temporal/structural ingest is reproducible), spawns the
// real engine on a free loopback port scoped to that dir, waits for it to come
// up, and publishes `ENGINE_BASE_URL` / `ENGINE_TOKEN` for every test.
//
// Each run owns an isolated cache and removes it during teardown.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { awaitEngineQuiescent } from "./awaitEngineQuiescent";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures/live-vault");
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BIN_NAME = process.platform === "win32" ? "vaultspec.exe" : "vaultspec";

/** Resolve the service binary the suite runs against.
 *
 *  An explicit `VAULTSPEC_TEST_ENGINE_BIN` override wins first, allowing the
 *  caller to pin the exact binary.
 *
 *  Otherwise pick the freshest of `engine/target/{release,debug}` by mtime:
 *  The chosen path and source are logged for diagnostics. */
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
  // Reuse an explicitly provided service to avoid port and cache contention.
  if (process.env["ENGINE_BASE_URL"]) return () => {};

  // 1. Scratch copy of the fixture corpus (owns its own engine-data cache).
  scratch = mkdtempSync(join(tmpdir(), "vaultspec-livetest-"));
  cpSync(join(FIXTURE_DIR, ".vault"), join(scratch, ".vault"), { recursive: true });
  cpSync(join(FIXTURE_DIR, "src"), join(scratch, "src"), { recursive: true });

  // 2. Initialize the fixture as a workspace with machine-local scaffolding.
  const install = spawnSync("vaultspec-core", ["install", "--target", scratch], {
    stdio: "pipe",
    shell: true,
  });
  if (install.status !== 0) {
    throw new Error(
      `vaultspec-core install failed (${install.status}): ${install.stderr?.toString() ?? ""}`,
    );
  }

  // 3. Commit the fixture while excluding service caches from change detection.
  writeFileSync(
    join(scratch, ".gitignore"),
    ".vault/data/\n.vault/logs/\n.vault/.obsidian/\n.vault/.trash/\n",
  );
  git(scratch, ["init", "-q", "-b", "main"]);
  git(scratch, ["add", "-A"]);
  git(scratch, ["commit", "-qm", "fixture corpus"]);

  // 3b. Create a sibling scope without workspace metadata for degradation tests.
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
  // Report the exact binary and source used by the run.
  console.info(
    `[live-engine] binary: ${ENGINE_BIN} (source: ${ENGINE_BIN_SOURCE}) → ${baseUrl}`,
  );
  engine = spawn(ENGINE_BIN, ["serve", "--port", String(port), "--no-seat"], {
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

  // Wait for initial ingestion to settle before publishing the service endpoint.
  try {
    await awaitEngineQuiescent({ baseUrl, token, timeoutMs: 90_000 });
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
