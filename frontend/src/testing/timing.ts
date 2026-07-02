// Test timing policy (TIH-002): the engine-round-trip timeout as ONE piece of data plus
// the helpers that apply it, so async-wait timeouts are a single policy — not 116
// scattered (mostly absent) literals.
//
// Why this exists: the frontend suite runs ONLINE against a single shared `vaultspec
// serve` (vite `fileParallelism:false` → test files run sequentially over one mutable
// engine), which slows under cumulative load. testing-library's async utilities
// (`waitFor`, `findBy*`) default to a ~1s timeout — far under the suite's 15s
// `testTimeout` — so a wait for an engine-derived result intermittently exceeds 1s at
// full-suite scale and fails, even though the engine is healthy (the GS-007 VaultBrowser
// flake). Routing every engine-dependent wait through this one policy gives it honest
// headroom and makes the budget tunable in ONE place.
//
// 6000ms matches the `{ timeout: 6000 }` engine-round-trip convention already used across
// the stores test suite (dashboardState / searchController / ragControl /
// commandPaletteLensIntent). Test-only module — imported solely by `*.test.*` files.

import { waitFor } from "@testing-library/react";

/**
 * The engine-round-trip wait budget, in milliseconds. The ONE source of truth for how
 * long an engine-dependent async wait may take before it is a real failure; tune the
 * suite's tolerance here, never at a callsite.
 */
export const ENGINE_ROUND_TRIP_TIMEOUT_MS = 6000;

/**
 * Drop-in wait options carrying the engine-round-trip timeout. Pass as the 2nd argument
 * to testing-library's `waitFor`, or as the 3rd (`waitForOptions`) argument to a
 * `findBy*` query:
 *
 *   await waitFor(() => expect(row).toBeTruthy(), ENGINE_WAIT);
 *   await screen.findByRole("navigation", { name: "…" }, ENGINE_WAIT);
 */
export const ENGINE_WAIT: { timeout: number } = {
  timeout: ENGINE_ROUND_TRIP_TIMEOUT_MS,
};

/**
 * `waitFor` pre-applying the engine-round-trip timeout policy — a drop-in for
 * testing-library's `waitFor` at any engine-dependent callsite:
 *
 *   await waitForEngine(() => expect(sections).toHaveLength(2));
 *
 * Per-call options still win (a longer one-off `timeout`, a custom `interval`), so a
 * callsite can override the policy where it genuinely needs to without abandoning it.
 */
export function waitForEngine<T>(
  callback: () => T | Promise<T>,
  options?: Parameters<typeof waitFor>[1],
): Promise<T> {
  return waitFor(callback, { timeout: ENGINE_ROUND_TRIP_TIMEOUT_MS, ...options });
}
