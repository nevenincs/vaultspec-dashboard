// Per-worker test setup: point the app-wide engine client at the live engine.
//
// The singleton `engineClient` the stores hooks use defaults to a browser
// fetch against the relative `/api` origin, which does not resolve in the node
// test environment. Binding it to the live transport once per worker means
// every hook-driven test speaks to the real spawned engine with no per-test
// transport wiring — and there is no mock to leak between suites.

import { afterEach } from "vitest";

import { engineClient } from "../stores/server/engine";
import { liveTransport } from "./liveClient";

engineClient.useTransport(liveTransport);

// #28 parallel-isolation: happy-dom aborts a file's still-pending fetches when it
// tears down that file's window at file-end (the `DetachedWindowAPI.abort ->
// Fetch.onAsyncTaskManagerAbort` AbortError). Background hook fetches (TanStack
// queryFns that do not thread the AbortSignal) routinely outlive a test, so under
// PARALLEL worker assignment that teardown abort fires asynchronously and surfaces
// in a SIBLING file's test — flaking even pure node-env tests (e.g.
// buildWindowCommands) that never touch the DOM. Draining each file's pending async
// HERE, after every test, keeps the abort inside the owning file's own run, where
// TanStack already handles the cancelled-query rejection — so it can never bleed
// across a worker. No-op outside happy-dom (node-env files expose no `happyDOM`); the
// live engine is local + fast, so the drain is cheap.
afterEach(async () => {
  const happyDOM = (
    globalThis as {
      happyDOM?: { abort?: () => void; waitUntilComplete?: () => Promise<void> };
    }
  ).happyDOM;
  // Let pending async tasks SETTLE before aborting the window (TIH-007c). A RAW
  // `patchDashboardState` (dashboardState.ts — neither a TanStack query nor a mutation,
  // so the per-suite `isFetching()===0` drain cannot see it) fired by a component effect
  // routinely outlives a test; aborting the window mid-flight cancels that fetch and its
  // AbortError surfaces in a LATER file. `waitUntilComplete` drains happy-dom's async
  // task manager so the raw patch completes first — killing the AbortError class at the
  // root. Bounded so a genuinely-persistent task (a live SSE stream, a poll interval)
  // can never hang teardown; the abort below is the backstop for anything still live.
  if (happyDOM?.waitUntilComplete) {
    await Promise.race([
      happyDOM.waitUntilComplete().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }
  happyDOM?.abort?.();
});
