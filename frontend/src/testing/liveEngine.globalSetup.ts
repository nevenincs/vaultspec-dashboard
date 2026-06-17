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

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures/live-vault");
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BIN_NAME = process.platform === "win32" ? "vaultspec.exe" : "vaultspec";

/** Pick the freshest built engine binary: debug is current on a dev machine
 *  (the release copy is held open by the dev server), release is current in CI.
 *  Choosing by mtime means the suite always runs against the latest build. */
function resolveEngineBin(): string {
  const candidates = ["release", "debug"].map((p) =>
    join(REPO_ROOT, "engine", "target", p, BIN_NAME),
  );
  const built = candidates
    .map((path) => {
      try {
        return { path, mtime: statSync(path).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter((c): c is { path: string; mtime: number } => c !== undefined)
    .sort((a, b) => b.mtime - a.mtime);
  if (built.length === 0) {
    throw new Error(
      `no vaultspec engine binary found under engine/target/{release,debug}/ — run \`cargo build\` first`,
    );
  }
  return built[0].path;
}

const ENGINE_BIN = resolveEngineBin();

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
  const r = spawnSync("git", args, { cwd: scratch, env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr?.toString() ?? r.status}`);
  }
}

let engine: ChildProcess | undefined;
let scratch: string | undefined;

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

  // 3. Spawn the real engine on a free loopback port, scoped to the scratch dir.
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
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
      throw new Error(`engine exited (${engine.exitCode}) during startup:\n${serveLog}`);
    }
    if (!token) {
      try {
        token = (JSON.parse(readFileSync(tokenPath, "utf8")) as { service_token?: string })
          .service_token!;
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
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  };
}
