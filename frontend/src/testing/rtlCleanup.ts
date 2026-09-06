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
// This is the only global per-test lifecycle barrier. Component effect cleanups
// own cancellation of the work they started; happy-dom window destruction stays
// exclusively with Vitest's awaited environment teardown at the file boundary.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
