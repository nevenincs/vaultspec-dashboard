---
tags:
  - '#research'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:c28562cc425b9e330c9984107fa92c423996a40ee03874fea24ff46259d8dc1b'
related: []
---

# `test-isolation-cleanup` research: `why component teardown never runs, and what to do about it`

Nothing unmounts a React component between tests in this repository. Half the
suites that mount components — 96 of 189 — therefore carry every component they
have ever rendered, still mounted and still subscribed, into every later test in
the same file. The leak is normally invisible; it became visible exactly once,
as a ~40% full-suite flake in `frontend/src/app/chrome/useReducedMotion.test.tsx`
that never reproduced in isolation, and was closed in commit `55b5e7a41b` by
having that one suite unmount itself. This document establishes the mechanism,
measures the exposure, and frames the option space for closing the class. It
does not choose; the ADR does.

## Findings

### `@testing-library/react` auto-cleanup is not installed here, and cannot be

`@testing-library/react@16.3.2` installs its own teardown only behind a check for
a BARE global binding:

```js
if (typeof afterEach === 'function') {
  afterEach(() => { cleanup(); });
}
```

That is `node_modules/@testing-library/react/dist/index.js:26`. `typeof afterEach`
reads `globalThis.afterEach`, which vitest publishes only under `test.globals:
true`. `frontend/vite.config.ts` does not set it, and every suite imports its
vitest verbs explicitly instead. So the branch is never taken and `cleanup` is
never registered.

An imported `afterEach` does not satisfy the check. `frontend/src/testing/liveSetup.ts:53`
registers a global `afterEach` through an ESM import, and it has no effect on
RTL's probe — the two are unrelated bindings. This is worth stating because the
presence of that hook makes the harness look as though a global teardown exists.

### The same missing global also disables RTL's act-environment block

The identical guard in `index.js:41` wraps a `beforeAll`/`afterAll` pair that sets
`globalThis.IS_REACT_ACT_ENVIRONMENT`. It is equally never installed, and nothing
in `frontend/src` or `frontend/dev` sets that flag — a repo-wide grep for
`IS_REACT_ACT_ENVIRONMENT`, `setReactActEnvironment`, and `RTL_SKIP_AUTO_CLEANUP`
returns nothing. RTL's own renders are unaffected, because
`dist/act-compat.js:41` (`withGlobalActEnvironment`) sets and restores the flag
around each `act` call it makes itself. What IS affected is everything outside an
RTL `act` call: with the flag globally true, React reports "an update was not
wrapped in act(...)" for state changes that today pass silently.

This matters to the decision, not just to the description: it means turning on
`globals: true` is not a one-effect change. It would install teardown AND flip
the act environment for all 499 files at once.

### `cleanup()` is inert where nothing was mounted

`dist/pure.js:301` iterates `mountedRootEntries` and touches `document` only
inside that loop. With an empty registry it is a no-op, so a global hook is safe
in the `environment: "node"` files (271 of 499) that never render. This removes
the obvious objection to a setup-file hook — that it would break the node-env
half of the suite.

### afterEach hooks run in reverse registration order

`node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:479` resolves
`sequence.hooks` to `"stack"` when unset, and `@vitest/runner`
`dist/chunk-artifact.js:2568` reverses `afterEach` (and `afterAll`) under that
setting. Consequences for any global-hook option:

- Per-suite `afterEach` hooks, registered later during collection, run BEFORE
  setup-file hooks. The 93 suites that already call `cleanup()` therefore keep
  running first; a second global `cleanup()` after them is idempotent.
- Among setup files, the one listed LAST runs its `afterEach` FIRST. A teardown
  hook must therefore be listed after `liveSetup.ts` to unmount before that
  file's `happyDOM.waitUntilComplete()` drain and `happyDOM.abort()` — which is
  the order teardown wants, since unmounting is what triggers the effect
  cleanups (aborted fetches, closed streams) the drain then settles.

### Exposure, measured

Counted over `frontend/src` and `frontend/dev`, excluding `dev/tooling/fixtures`:

| | count |
|---|---|
| test files total | 499 |
| files declaring `@vitest-environment happy-dom` | 228 |
| files calling `render(` or `renderHook(` | 189 |
| ...of those, calling `cleanup(` | 93 |
| ...of those, NOT calling `cleanup(` | **96** |

A leaked mount is only observable when the component subscribes to state shared
across tests: a `document` attribute, a media query, a global listener. That is
why 95 of the 96 have never been seen to fail. The suites that subscribe at
document level are the ones with live risk — `app/chrome/useFocusZone.render.test.tsx`,
`app/chrome/useDismissOnEscape.test.ts`, `app/chrome/Dialog.render.test.tsx`,
and the `app/kit/*` render suites.

### The one observed failure, and what it proved

From the investigation recorded in the campaign that produced `55b5e7a41b`, the
captured failure instrumentation read `sub=2 unsub=0 notify=3` against an
expectation of four notifications for two subscriptions across two transitions,
with the DOM attribute correctly `"false"` while the hook returned `true`, and an
independent `MutationObserver` on the same attribute firing normally. `unsub=0`
excludes teardown; `sub=2` is the leaked first-test subscription. Three
competing explanations — cross-file `matchMedia` pollution, dropped happy-dom
microtask delivery under `happyDOM.abort()`, and a torn-down subscription — were
each refuted by a measured counter rather than by argument. Notably the
`abort()` explanation had a 100% deterministic standalone reproduction and still
was not what fired in situ; proving a mechanism exists is not proving it fires.

### Option space

Three shapes, with the trade-off that distinguishes them:

1. **`test.globals: true` in `frontend/vite.config.ts`.** Two lines. Installs
   RTL's own teardown, so it needs no new file and cannot drift out of the
   listing. But it also installs the act-environment block above, publishes
   `describe`/`it`/`expect` as globals across a codebase that imports them, and
   would want `types: ["vitest/globals"]` in tsconfig to keep the type surface
   honest. The blast radius is the whole harness, and only one part of it is
   wanted.
2. **A setup file registering `afterEach(cleanup)`.** One new file plus one
   entry in `test.setupFiles`. Keeps `globals: false`, changes exactly one
   behaviour, and orders correctly against `liveSetup.ts` given the `"stack"`
   finding above. Costs an ordering constraint that must be written down, since
   it is not visible from the listing alone.
3. **Per-suite `cleanup()` in the remaining 96.** No harness change at all, and
   the diff is auditable file by file. But it fixes the instances, not the class:
   suite 97 reintroduces the defect, and the mechanism only reports it as a
   ~40% flake in a 30-minute run.

Options 1 and 2 both risk unmasking suites that currently pass because of the
leak — a second test that reads state the first test's still-mounted component
maintains. That risk is not estimable from static reading; it has to be
measured by running the suite with teardown on. Option 3 carries the same risk,
spread across 96 separate landings.

Whichever is chosen, the mechanism needs a guard that reads the DISCONFIRMING
value — a test that mounts in one case and asserts absence in the next — rather
than one that asserts a hook is registered. The registration-versus-firing
distinction is the specific error this investigation made once already.

### Not investigated

Whether any of the 93 suites that call `cleanup()` today could drop the call
once a global barrier exists. They are idempotent and harmless, and removing 93
call sites would enlarge a harness-contract diff for no behavioural gain.

Whether the missing act environment is itself hiding defects. It is a real
second consequence of the same missing global, but it is a separate question
with its own blast radius and belongs in its own record.

## Sources

- `node_modules/@testing-library/react/dist/index.js:26` — the `typeof afterEach` guard
- `node_modules/@testing-library/react/dist/index.js:41` — the act-environment guard
- `node_modules/@testing-library/react/dist/act-compat.js:41` — `withGlobalActEnvironment`
- `node_modules/@testing-library/react/dist/pure.js:301` — `cleanup()` body
- `node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:479` — `sequence.hooks ??= "stack"`
- `node_modules/@vitest/runner/dist/chunk-artifact.js:2568` — reverse ordering for `afterEach`
- `frontend/vite.config.ts:117` — the vitest `test` block
- `frontend/src/testing/liveSetup.ts:53` — the existing imported-`afterEach` teardown
- `frontend/src/app/chrome/useReducedMotion.test.tsx` — the single suite fixed in `55b5e7a41b`
- `@testing-library/react@16.3.2`, `vitest@4.1.8`
