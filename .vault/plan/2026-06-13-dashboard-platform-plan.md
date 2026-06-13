---
tags:
  - '#plan'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
tier: L2
related:
  - '[[2026-06-13-dashboard-platform-adr]]'
  - '[[2026-06-13-dashboard-platform-research]]'
---


# `dashboard-platform` plan

The horizontal frontend runtime substrate - structured logger, exception containment, the action/dispatch seam, and the failure-to-degradation policy - that the data, scene, and chrome teams build onto.

### Phase `P01` - Observability spine

Ship the structured logger and global error traps the whole frontend logs through.

- [x] `P01.S01` - Implement the leveled, namespaced ring-buffer logger with a pluggable sink array; `frontend/src/platform/logger/logger.ts`.
- [x] `P01.S02` - Install the global window.onerror and unhandledrejection traps routed to the logger; `frontend/src/platform/logger/globalTraps.ts`.
- [x] `P01.S03` - Bridge scene-worker logs to the main logger and migrate the two worker console calls; `frontend/src/platform/logger/workerBridge.ts`.

### Phase `P02` - Exception containment

Contain thrown renders per region so a crash degrades a region, never the whole app.

- [x] `P02.S04` - Implement the ErrorBoundary class with app and region variants, reset, and the logger hook; `frontend/src/platform/errors/ErrorBoundary.tsx`.
- [x] `P02.S05` - Mount the app-level boundary as the last line in the app root; `frontend/src/main.tsx`.
- [x] `P02.S06` - Wrap the four AppShell regions in region boundaries with designed fallbacks; `frontend/src/app/AppShell.tsx`.
- [x] `P02.S07` - Add the dev-only crash-injection affordance for adverse-condition testing; `frontend/src/platform/errors/CrashInjector.tsx`.

### Phase `P03` - Dispatch seam

Generalize the two proto-commands into one thin typed action/dispatch seam.

- [x] `P03.S08` - Implement the typed Action and dispatch core with the middleware chain; `frontend/src/platform/dispatch/dispatch.ts`.
- [x] `P03.S09` - Implement the logging, tracing, and arm-to-confirm guard middlewares; `frontend/src/platform/dispatch/middleware.ts`.
- [x] `P03.S10` - Implement the useAction React hook face over the dispatch core; `frontend/src/platform/dispatch/useAction.ts`.

### Phase `P04` - Exception policy and public API

Codify the failure taxonomy, route failures into the degradation vocabulary, and publish the platform barrel.

- [x] `P04.S11` - Implement the FailureKind taxonomy, classifyError, and the failure-policy hook with an injected degradation mapper; `frontend/src/platform/policy/failurePolicy.ts`.
- [x] `P04.S12` - Publish the platform public API barrel and wire the query client error sink to the policy; `frontend/src/platform/index.ts`.

### Phase `P05` - Live verification under adverse conditions

Prove the substrate contains and degrades under live adverse conditions and ships every gate green.

- [x] `P05.S13` - Add the live adverse-condition spec exercising each FailureKind through the boundaries and policy; `frontend/e2e/adverse.spec.ts`.
- [x] `P05.S14` - Run typecheck, lint, test, build, and vault check green and record the verification; `frontend/`.

## Description

This plan executes the `dashboard-platform` ADR: a new `frontend/src/platform/`
substrate - a fifth peer of the four-layer ownership map - that the data, scene, and
chrome teams consume and that imports none of them. It delivers the four cross-cutting
concerns the prior GUI cycle left unbuilt under its own degrade-truthfully thesis:
structured logging (D3), exception containment (D5), a thin typed action/dispatch seam
(D2), and the failure-to-degradation policy with the mechanism-here / vocabulary-in-app
split (D1, D4). The build front-loads the pure additions (logger, then boundaries) that
need no cross-team negotiation, then the dispatch seam and policy, then a live
adverse-condition verification. The existing degradation matrix in `app/degradation`
stays the vocabulary owner; the substrate routes failures into it through an injected
mapper and never imports upward.

## Steps

The Phase and Step structure for this L2 plan is rendered above, beneath the plan title
(the serializer anchors the canonical structure there). Five phases, fourteen steps.

## Parallelization

Phases are mostly sequenced by dependency. `P01` (observability spine) has no
dependency and lands first; `P01.S01` (the logger) gates `P01.S02`/`P01.S03` and every
later phase that logs. `P02` (exception containment) depends only on the logger and is
the second deliverable; within it, `P02.S04` (the boundary component) gates `P02.S05`
and `P02.S06` (the mounts), while `P02.S07` (crash injector) can land in parallel with
the mounts. `P03` (dispatch seam) depends on the logger only and can proceed in parallel
with `P02` once `P01.S01` is done; within it `P03.S08` gates `P03.S09` and `P03.S10`.
`P04` (policy and public API) depends on the logger, the boundaries (`P02.S04`), and the
dispatch core; `P04.S12` (the barrel) must come last among build steps because it
re-exports all prior surfaces. `P05` (live verification) is strictly last - it exercises
the assembled substrate end to end.

## Verification

The plan is complete when every Step is closed and all of the following hold:

- `cd frontend && npm run typecheck` passes with zero errors.
- `cd frontend && npm run lint` passes clean (no new disables).
- `cd frontend && npm run test` passes, including new unit tests for the logger, the
  boundary, the dispatch seam, and the policy classifier.
- `cd frontend && npm run build` produces a production bundle with no platform module
  pulling a new runtime dependency.
- The live adverse-condition pass (`P05.S13`) demonstrates, against the running app,
  that a thrown region degrades to its boundary fallback without white-screening a
  sibling region, that the region recovers on retry, and that the global traps capture
  an unhandled rejection into the logger ring buffer. The failed-query and
  dropped-stream paths are classified by the failure policy and covered by the
  `failurePolicy`, `globalTraps`, and degradation-matrix unit suites; the
  degraded-surface rendering for those conditions is owned and tested by the
  `app/degradation` layer (against contract section 8), not by this substrate's e2e.
- `vaultspec-core vault check all` is green.
- The `vaultspec-code-review` audit signs off with no unresolved HIGH findings.
