// Engine-quiescence barrier (TIH-003 — the real GS-007 fix).
//
// The frontend suite runs ONLINE against ONE shared `vaultspec serve` (vite
// `fileParallelism:false` → files run sequentially over a single mutable engine). A
// vault write (or the initial cold ingest) triggers a graph REBUILD, which bumps the
// engine's `generation` counter; while that rebuild is in flight the corpus a render
// assertion reads is MID-FLUX — nodes/edges appear and disappear as the fold settles.
// That is the data-variability behind the intermittent VaultBrowser flake: a longer
// waitFor timeout (TIH-002) did NOT fix it (2/4) because it is not a clock race — the
// assertion times out having found the WRONG/MISSING data, not having found nothing.
//
// The barrier waits until the engine is QUIESCENT. Three conditions must hold together —
// each closes a window where "serving + a short generation-stable read" would FALSELY
// pass while the corpus is still moving:
//   (a) SERVING — `data.ok === true` on the active cell.
//   (b) DECLARED tier NOT BUILDING — closes the ASYNC-FOLD window. `rebuild_and_swap`
//       commits the STRUCTURAL graph synchronously (generation bump #1), then
//       `spawn_declared_fold` runs the vaultspec-core subprocess for SECONDS and commits
//       AGAIN (bump #2 + declared edges + projection-cache invalidation). Between the two
//       commits `generation` is momentarily stable, so a naive read passes mid-fold and
//       the test eats bump #2. While the fold is pending the engine reports the declared
//       tier with the `DECLARED_BUILDING` sentinel ("declared tier building",
//       engine-graph/src/index.rs), so we require declared NOT building. We assert
//       NOT-BUILDING, never AVAILABLE: a genuinely-degraded scope reports declared down
//       with a STABLE non-building reason, which is settled-either-way — so this is
//       correct for BOTH the healthy and degraded fixtures and never hangs.
//   (c) generation STABLE across a window STRICTLY LONGER than the watcher debounce —
//       closes the DEBOUNCE window. The engine watcher debounces filesystem events by
//       2000ms (registry.rs); a prior file's write fires its rebuild up to ~2s LATER, so
//       during that gap generation is stable + serving and a sub-2s window would pass
//       right before the rebuild detonates. GENERATION_SETTLE_WINDOW_MS must therefore
//       EXCEED 2000ms.
//
// RESIDUAL (barrier-side only): a rebuild that is DEBOUNCED-PENDING but not yet fired is
// unobservable from /status, so "window > debounce" is the only closure the barrier can
// give — it cannot see a write whose rebuild has not started. The DURABLE fix for that
// class is removing the pending writes themselves (TIH-004 test write-hygiene).
//
// Reads the engine's real `/status` wire (stream.rs `status()` → the contract envelope):
// `{ data: { ok, index: { generation } }, tiers: { declared?: { reason } } }`. Node-safe:
// global `fetch` only (no @testing-library import), so it runs in BOTH the vitest global
// setup (before any test env) and a render suite's beforeAll.

/** Generation must hold steady for at least this long before the engine is declared
 *  settled. MUST EXCEED the engine watcher debounce (registry.rs, 2000ms) so a
 *  debounced rebuild that fires late is observed and restarts the window rather than
 *  being missed. */
export const GENERATION_SETTLE_WINDOW_MS = 2500;

export interface AwaitEngineQuiescentOptions {
  /** Engine origin. Defaults to `process.env.ENGINE_BASE_URL` (published by the global
   *  setup). Pass explicitly from the global setup itself, before it publishes env. */
  baseUrl?: string;
  /** Bearer token. Defaults to `process.env.ENGINE_TOKEN`. */
  token?: string;
  /** Generation-stability window, ms. Default GENERATION_SETTLE_WINDOW_MS (> debounce). */
  settleWindowMs?: number;
  /** Poll cadence, ms. Default 200. */
  intervalMs?: number;
  /** Max total wait before throwing, ms. Default 20000 — a cold fold takes a few
   *  seconds; plus the settle window, still well under a beforeAll's budget. */
  timeoutMs?: number;
}

interface StatusEnvelope {
  data?: { ok?: boolean; index?: { generation?: number } };
  tiers?: Record<string, { available?: boolean; reason?: string }>;
}

/**
 * Resolve once the shared engine is quiescent (serving AND declared-not-building AND
 * generation stable past the debounce window), or reject on timeout with a diagnostic
 * snapshot. Because it costs at least one settle window (~2.5s), call it in the global
 * setup and in write-adjacent render beforeAlls — NOT around every test.
 */
export async function awaitEngineQuiescent(
  options: AwaitEngineQuiescentOptions = {},
): Promise<void> {
  const baseUrl = options.baseUrl ?? process.env["ENGINE_BASE_URL"];
  const token = options.token ?? process.env["ENGINE_TOKEN"];
  if (!baseUrl) {
    throw new Error(
      "awaitEngineQuiescent: no engine base URL (pass { baseUrl } or ensure liveEngine.globalSetup published ENGINE_BASE_URL).",
    );
  }
  const settleWindowMs = options.settleWindowMs ?? GENERATION_SETTLE_WINDOW_MS;
  const intervalMs = options.intervalMs ?? 200;
  const timeoutMs = options.timeoutMs ?? 20_000;

  const deadline = Date.now() + timeoutMs;
  let settledGeneration: number | null = null;
  let settledSince = 0;
  let lastSnapshot = "no successful /status poll yet";

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const body = (await res.json()) as StatusEnvelope;
        const serving = body.data?.ok === true;
        const generation = body.data?.index?.generation;
        const declaredReason = body.tiers?.declared?.reason;
        const declaredBuilding =
          typeof declaredReason === "string" &&
          declaredReason.toLowerCase().includes("building");
        lastSnapshot = `serving=${serving} generation=${String(generation)} declaredBuilding=${declaredBuilding}`;
        if (serving && !declaredBuilding && typeof generation === "number") {
          if (generation !== settledGeneration) {
            // First observation of this generation with the other conditions holding —
            // (re)start the stability window. A committed rebuild lands here.
            settledGeneration = generation;
            settledSince = Date.now();
          } else if (Date.now() - settledSince >= settleWindowMs) {
            return; // held steady past the debounce window — quiescent
          }
        } else {
          settledGeneration = null; // not settled — restart the window when it holds again
        }
      } else {
        settledGeneration = null;
      }
    } catch {
      settledGeneration = null; // engine not answering yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `awaitEngineQuiescent: engine not quiescent within ${timeoutMs}ms ` +
      `(needed serving + declared-not-building + generation stable for ` +
      `${settleWindowMs}ms > watcher debounce). Last: ${lastSnapshot}`,
  );
}
