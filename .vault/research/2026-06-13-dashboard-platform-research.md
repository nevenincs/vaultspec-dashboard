---
tags:
  - '#research'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-12-dashboard-gui-audit]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-12-dashboard-foundation-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-platform` research: `frontend runtime substrate`

The previous cycle shipped a feature-complete GUI (the `dashboard-gui` plans of
2026-06-12 and 2026-06-13) whose thesis is *degrade truthfully, never lie about
availability*. This research grounds the horizontal runtime substrate that thesis
silently depends on and that does not yet exist: exception containment, structured
logging, a unified action/dispatch seam, and a coherent exception-handling policy.
The substrate is horizontal — every component and all four feature teams (data,
scene, chrome, and this platform team) sit on it — so it must lead the feature
teams rather than be retrofitted under them. The question researched here is *what
exactly is missing, what existing seams the substrate must build on without
disturbing, and what boundary the substrate must respect* so the ADR can commit
the decisions the other teams build against.

## Findings

### F1 — The gap is real and load-bearing

A direct sweep of `frontend/src` confirms the missing substrate:

- **No exception containment anywhere.** A search for `ErrorBoundary`,
  `componentDidCatch`, and `getDerivedStateFromError` returns zero matches. The app
  root (`src/main.tsx`) mounts `StrictMode > QueryClientProvider > RouterProvider`
  with no boundary at any level. A single thrown render white-screens the entire
  app — which makes the degradation thesis a lie, because a crashed region renders
  as a blank page rather than a designed degraded state.
- **No logging or telemetry module.** Structured logging is absent; the only
  `console.*` calls live in two scene-worker files (`scene/field/fa2.worker.ts`,
  `scene/field/fieldAssembly.ts`). There is no leveled, namespaced logger, no ring
  buffer, no dev overlay, and no sink the future telemetry or a `/logs`-style
  correlation could hang off. The engine, by contrast, ships structured envelopes
  and a crash-log hook; the frontend has no equivalent.
- **No unified action/dispatch seam.** User intents are ad-hoc store mutations and
  per-component `useMutation` calls, so there is no single place an action can be
  logged, traced, guarded, or rolled back.
- **No exception-handling policy.** `catch` handling is scattered; there is no
  shared rule turning a failed query, a thrown component, a dead FA2 worker, or a
  dropped SSE stream into a *degraded state* rather than a crash or a silent
  swallow.

### F2 — The substrate already has two proto-commands and a degradation vocabulary

The substrate is not greenfield in spirit — three existing surfaces are the
prototypes it must generalize, two of which must not be disturbed:

- **Proto-command A — the scene command seam.** `scene/sceneController.ts` exposes
  a `SceneCommand` discriminated union plus `command(cmd)` in / `on(listener)` out.
  This is a clean command/event shape — but it is a **locked seam** (W01.P01.S04,
  "surface changes from here on are ADR-flagged redlines, not drive-by edits") and
  is framework-free by design. The dispatch layer may generalize its *shape*; it
  must never edit it.
- **Proto-command B — arm-to-confirm ops.** `app/right/OpsPanel.tsx` runs
  whitelisted ops verbs through a `useMutation` with an arm-to-confirm guard
  (`confirming` state) and `onSuccess`/`onError`/`onSettled`. This is the second
  command prototype — a user intent guarded before it fires — and it generalizes
  cleanly into a reusable guard middleware.
- **Degradation vocabulary already exists.** `app/degradation/matrix.ts` is a pure
  function `matrixFor(inputs) -> SurfaceStates` over five condition inputs
  (`ragDown`, `dateMandateMissing`, `brokenLinkCount`, `streamLost`, `noVault`),
  with a debug-switch store that makes every condition reachable in development and
  a `useSurfaceStates()` hook. It is already tested against the contract's §8
  degradation table. This is the *designed degraded-state vocabulary* — the
  substrate must route failures *into* it, not reinvent it.

### F3 — The binding boundary: mechanism in platform, vocabulary in app

`dashboard-layer-ownership` fixes four layers with one-way data boundaries: engine,
`stores/` (sole wire client), `scene/` (renders via commands), `app/` (leaf chrome,
no derived data, no `fetch`). The degradation matrix derives its inputs from
`EngineStatus` (a `stores/` type) and lives in `app/degradation/`. A platform
substrate that imported the matrix to render a fallback would import *upward* into
`app/`, breaking the substrate's value as a true foundation.

The resolution that survives the boundary: **the platform owns the mechanism, the
app owns the vocabulary.** Platform classifies a failure into a kind and severity,
contains it, and logs it; the binding of *kind → specific SurfaceState* stays in
`app/degradation/`. Platform exposes hooks and boundary components that accept an
injected mapper/fallback, so the substrate depends on nothing above it (framework
and shared *types* only — never `app/`, `scene/`, or concrete store instances). The
existing degradation matrix stays where it is — moving working, tested code is
churn the boundary does not require.

### F4 — Options considered per concern

- **Exception containment.** React has no function-component error boundary; a class
  boundary (`getDerivedStateFromError` + `componentDidCatch`) is the only
  mechanism, optionally wrapped by `react-error-boundary`. Options: (a) adopt the
  `react-error-boundary` dependency; (b) hand-roll a small class boundary.
  Recommendation: **hand-roll** — the surface needed (region id, injected fallback,
  reset, logger hook) is ~40 lines, avoids a runtime dependency on a substrate
  every team imports, and keeps `published-wheel-purity`-style dependency
  discipline. Mount one app-level boundary in `main.tsx` and four region boundaries
  in `AppShell.tsx` (left rail / stage / right rail / timeline), plus global
  `window.onerror` / `unhandledrejection` traps routed to the logger.
- **Logger.** Options: (a) a logging library (loglevel, pino) ; (b) a small
  in-house leveled logger with namespaces, a bounded ring buffer, and a pluggable
  sink array. Recommendation: **in-house** — mirror the engine's level vocabulary
  so frontend and engine logs read as one system, keep the ring buffer for the dev
  overlay and future correlation, and add no runtime dependency. The two
  scene-worker `console.*` calls migrate behind a worker→main postMessage bridge so
  worker logs reach the same ring buffer.
- **Dispatch seam.** Options: (a) a real state-container/command bus (Redux-like);
  (b) a thin typed `dispatch(action)` running a middleware chain (log → trace →
  guard → effect), with Zustand unchanged as the store. Recommendation: **thin
  middleware seam** — the brief's explicit "do not over-build, not a Redux empire"
  constraint, and it generalizes both proto-commands (arm-to-confirm becomes a guard
  middleware; the scene command shape is the model) without touching the locked
  scene seam.
- **Exception policy.** Encode the policy as shared hooks/utilities other teams
  import (a `classifyError` + `useFailurePolicy` seam, a query-error router that
  flows failures into the degradation vocabulary, a boundary contract), never as
  prose each team reimplements. SSE-resume stays with the Data team; platform
  provides only the "stream lost → degraded signal" classification.

### F5 — Sequencing and risk

The four feature teams are standing up now. Every day they build without these
seams, they invent ad-hoc error handling and `console.log`s that get ripped out
later — the multi-team rework pattern `review-revision-precedence` was codified
against. Highest-leverage first deliverable is **ErrorBoundary + logger**: pure
additions with no cross-team boundary negotiation that immediately make the other
teams' work crash-contained and observable. The dispatch seam touches everyone, so
it needs the ADR ratified before the feature teams adopt it. Therefore: publish the
module interfaces early (even stubbed) so the others import against them from their
first step.

### Open questions routed to the ADR

1. Is `src/platform/` a fifth peer layer of the ownership map, and what is its
   strict no-upward-import rule?
2. What is the dispatch seam's exact contract (action shape, middleware signature,
   React hook face) and how do the two proto-commands relate to it?
3. What are the logger's levels, ring-buffer bound, and sink contract, and how do
   they mirror the engine?
4. What is the failure taxonomy (`FailureKind`), and precisely where does the
   mechanism/vocabulary line fall between platform and `app/degradation`?
5. Where do boundaries mount, and what does a region fallback render?
