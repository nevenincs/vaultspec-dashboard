---
tags:
  - '#adr'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-07-12'
related:
  - "[[2026-06-13-dashboard-platform-research]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-platform` adr: `frontend runtime substrate` | (**status:** `accepted`)

## Problem Statement

This is a new feature opened in response to a gap the prior GUI cycle left under its
own thesis. The dashboard's headline promise is *degrade truthfully — never lie
about availability*. Yet the frontend has no exception containment (zero
`ErrorBoundary`), no structured logger (only two stray `console.*` in scene
workers), no unified action/dispatch seam, and no codified exception-handling
policy. A single thrown render therefore white-screens the whole app, which is the
degradation thesis lying at the worst possible moment. These four concerns are
*horizontal*: every component and all four frontend teams (data, scene, chrome, and
this platform team) consume them. Retrofitting them after four teams have built
ad-hoc patterns is exactly the multi-team rework the `review-revision-precedence`
lesson was codified against. This ADR commits the substrate's architecture so the
other teams build *onto* its seams rather than around them.

## Considerations

The substrate is not greenfield in spirit; the design is shaped by what already
exists (grounded in the `dashboard-platform` research):

- **Two proto-commands.** `scene/sceneController.ts` is a clean `SceneCommand`
  union with `command()` in / `on()` out, but it is a **locked seam**
  (W01.P01.S04) the dispatch layer may model on yet never edit. `app/right/OpsPanel`
  is an arm-to-confirm `useMutation` — a guarded user intent that generalizes into
  reusable middleware.
- **A degradation vocabulary already exists.** `app/degradation/matrix.ts` is a
  pure `matrixFor(inputs) -> SurfaceStates` over five conditions, with a debug
  switch and a `useSurfaceStates()` hook, already tested against contract §8. The
  substrate must route failures *into* this vocabulary, not reinvent it.
- **The four-layer ownership boundary.** `dashboard-layer-ownership` fixes engine →
  `stores/` (sole wire client) → `scene/` → `app/` with one-way data flow. The
  degradation matrix derives from `EngineStatus` (a `stores/` type) and lives in
  `app/`. A substrate that imported it to render a fallback would import *upward*,
  dissolving its own foundation value.
- **Engine conventions to mirror.** The engine ships structured envelopes and a
  crash-log hook; mirroring its level vocabulary lets frontend logs and the engine's
  `/logs` read as one system.

## Constraints

- **The scene command seam is locked.** The dispatch generalization models its
  shape; any change to `scene/sceneController.ts` is an ADR-flagged redline, not a
  drive-by.
- **No upward imports from the substrate.** `src/platform/` may import the React/
  query runtime and shared *types* only — never `app/`, `scene/`, or concrete store
  instances. This is the load-bearing constraint that keeps it a true foundation.
- **Zustand stays the store; this is not a Redux empire.** The dispatch seam is a
  thin typed pipeline, additive and opt-in — every existing direct store mutation
  and per-component `useMutation` keeps working unchanged.
- **No new runtime dependency for cross-cutting substrate.** Every team imports this
  module; in the spirit of `published-wheel-purity`, the boundary and logger are
  hand-rolled (React's class-only error mechanism is ~40 lines wrapped) rather than
  pulling `react-error-boundary` / a logging library into the universal import path.
- **Mechanism, not vocabulary.** The substrate must not own which degraded surface
  state a failure maps to — that stays in `app/degradation`. Crossing this line is
  what would force the upward import.
- **Parent-feature stability.** The substrate builds only on shipped, stable
  surfaces (React 19, TanStack Query 5, Zustand 5, the locked scene seam, the
  existing degradation matrix). No frontier or unstable dependency is introduced.

## Implementation

A new top-level frontend module `src/platform/` — a **fifth peer of the ownership
map**, a horizontal substrate beneath `stores/`, `scene/`, and `app/` — published
through a single barrel so the other teams import stable interfaces. Five decisions:

- **D1 — `src/platform/` as substrate layer.** It is the runtime foundation the
  other three frontend layers consume and that imports none of them. The
  `dashboard-layer-ownership` map gains a substrate row; the no-upward-import rule is
  its boundary. The barrel re-exports the logger, the boundary components, the
  dispatch seam, and the failure-policy hooks.

- **D2 — Dispatch seam.** A typed `Action` (`{ type, payload?, meta? }`) flows
  through `dispatch(action)`, which runs a middleware chain (trace → log → guard →
  effect) before the effect executes - trace stamps the correlation id first so the
  log line carries it. Middlewares are composable `(action, next) =>`
  functions; arm-to-confirm becomes a *guard* middleware generalizing `OpsPanel`.
  A `useAction()` React hook is the component face. The seam is opt-in: it is where
  a user intent goes when it wants logging, tracing, guarding, or audit for free.
  The scene command union is the *model* for the action shape, never imported or
  mutated.

- **D3 — Logger.** Leveled (`debug`/`info`/`warn`/`error`, mirroring the engine),
  namespaced (`logger.child("stores.engine")`), with a bounded ring buffer (default
  cap, oldest-evicted) feeding an optional dev overlay and future correlation, and a
  pluggable sink array (console sink in dev, ring-buffer sink always, remote sink as
  a future addition). A worker→main `postMessage` bridge lets the two scene-worker
  `console.*` calls log into the same buffer. The logger is the substrate the dev
  degradation-debug switch and any future telemetry hang off.

- **D4 — Exception-handling policy: mechanism here, vocabulary in `app/`.** A
  `FailureKind` taxonomy — `transient` (retry), `degraded` (route to the degradation
  vocabulary), `contained` (nearest region boundary fallback), `fatal` (app
  boundary) — plus a `classifyError(err)` over the known failure shapes
  (`EngineError` by status, query errors, worker-death, stream-loss). The policy is
  shipped as importable hooks/utilities (`useFailurePolicy`, a query-error router),
  never prose. The *binding* of `degraded` → a specific `SurfaceState` is invoked
  through a mapper the `app/degradation` layer provides, so platform stays
  vocabulary-free. SSE-resume remains the Data team's; platform contributes only the
  stream-lost classification.

- **D5 — Boundary mount map.** One app-level `ErrorBoundary` as the last line in
  `src/main.tsx` (wrapping the router), and four region boundaries in
  `app/AppShell.tsx` — left rail, stage, right rail, timeline — so a thrown right
  rail cannot take down the stage. Each boundary logs the error, renders a designed
  contained fallback (visually consistent with degraded states, with a reset
  affordance), and recovers in isolation. Global `window.onerror` /
  `unhandledrejection` traps route to the logger. A dev-only crash-injection
  affordance (mirroring the degradation debug switch) makes every boundary reachable
  for adverse-condition verification.

## Rationale

Each decision answers an open question from the research. D1 follows from F3: the
only way the substrate stays a foundation is a no-upward-import rule, so it must be
named as its own layer rather than smuggled into `app/`. D2 follows from F2 and the
brief's explicit "not a Redux empire" — the two proto-commands already prove the
command/guard shape, so the seam generalizes them thinly. D3 mirrors the engine
(F2) and keeps `published-wheel`-style dependency hygiene (F4). D4 is the crux: F3
showed that owning the degraded-state *vocabulary* forces an upward import, so the
mechanism/vocabulary split is the boundary-preserving resolution. D5 follows from
F1 and the real `AppShell` four-region structure — per-region containment is what
makes "a thrown rail doesn't kill the stage" true rather than aspirational. The
sequencing (F5) makes ErrorBoundary + logger the first deliverable: pure additions
with no cross-team negotiation that immediately make the other teams observable and
crash-contained.

## Consequences

- **Gains.** The degradation thesis becomes real — a crash degrades a region
  instead of white-screening the app. The frontend gains a single observability
  spine and a single place to log, trace, and guard intents. Publishing the
  interfaces early lets the feature teams import stable seams from step one,
  defusing the rework trap.
- **Honest difficulties.** The dispatch seam is cross-team and only earns its keep
  if the feature teams actually route intents through it; adoption is social, not
  just technical, so the seam must stay genuinely thin or teams will route around
  it. The mechanism/vocabulary split adds one indirection (platform classifies, app
  maps) that must be documented or it will be collapsed by a well-meaning shortcut —
  re-creating the upward import. The worker logging bridge adds a small amount of
  plumbing across the worker boundary.
- **Pathways opened.** The ring-buffer sink is the substrate for a future telemetry
  pipeline and `/logs` correlation with the engine. The dispatch middleware chain is
  where future audit, undo/rollback, and tracing land without re-plumbing callers.

## Codification candidates

These are *candidates* only — none is promoted on first encounter; each is a
codify-phase candidate after the substrate holds across a full execution cycle.

- **Rule slug:** `platform-owns-mechanism-not-vocabulary`.
  **Rule:** The `src/platform/` substrate classifies and contains failures but
  never owns which degraded surface state a failure maps to; the degradation
  vocabulary stays in `app/degradation`, invoked through an injected mapper, so the
  substrate never imports upward.

- **Rule slug:** `ui-intents-flow-through-dispatch`.
  **Rule:** A user intent that needs logging, guarding, tracing, or audit is
  dispatched through the platform action seam rather than mutating a store directly,
  so there is one place every intent can be observed and guarded.

- **Rule slug:** `no-raw-console-use-the-platform-logger`.
  **Rule:** Frontend code logs through the platform logger (leveled, namespaced,
  ring-buffered), never `console.*` directly, so every log reaches the shared buffer
  and the dev overlay.

- **Rule slug:** `every-render-region-has-a-boundary`.
  **Rule:** Each independently-degradable UI region mounts inside a platform region
  boundary so a thrown render is contained to its region and never white-screens a
  sibling.
