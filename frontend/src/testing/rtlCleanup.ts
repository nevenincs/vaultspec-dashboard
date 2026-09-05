// Global unmount barrier: @testing-library/react's auto-cleanup does not
// register in this repo, so nothing else unmounts between tests.
//
// RTL's `dist/index.js` registers `afterEach(cleanup)` only when a BARE global
// `afterEach` exists (`typeof afterEach === 'function'`). `vite.config.ts`
// keeps `globals: false` — every suite imports its vitest verbs explicitly — so
// that global is undefined and RTL's auto-cleanup is never installed. The
// consequence is silent: a component mounted by one test stays mounted, and
// stays SUBSCRIBED, through every later test in the same file.
//
// That is only observable when the leaked component subscribes to SHARED
// state. It was diagnosed the hard way in `useReducedMotion`, a
// `useSyncExternalStore` over a MutationObserver on `documentElement`: with two
// live subscriptions instead of one, the second test's hook lost the race for a
// notification and read a stale value — a ~40% flake in a full-suite run that
// never reproduced in isolation.
//
// Registering the hook HERE makes the barrier a property of the harness rather
// than of each author remembering it. `cleanup()` touches `document` only while
// unmounting a mounted root, so it is an inert no-op in the node-environment
// files that never render.
//
// ORDERING: vitest's `sequence.hooks` defaults to `"stack"`, so afterEach hooks
// run in REVERSE registration order. This file is listed after `liveSetup.ts`
// in `test.setupFiles`, so this hook runs BEFORE liveSetup's happy-dom drain —
// which is the order teardown needs: unmount first, so the effect cleanups an
// unmount triggers (aborted fetches, closed streams) are still drained by
// `waitUntilComplete` before the window is aborted.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
