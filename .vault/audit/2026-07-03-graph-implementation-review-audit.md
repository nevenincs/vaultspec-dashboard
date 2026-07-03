---
tags:
  - '#audit'
  - '#graph-implementation-review'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-graph-representation-adr]]"
  - "[[2026-07-03-graph-simulation-stability-reference]]"
  - "[[2026-07-02-graph-implementation-review-audit]]"
---

# `graph-implementation-review` audit: `full graph package review — emphasis grammar, sim mirror, render lerp`

## Scope

User-directed full audit of the graph package (2026-07-03), reviewer-driven single-agent
(no subagent fan-out, per user direction): `frontend/src/scene/three/threeField.ts`,
`frontend/src/scene/three/d3ForceSolver.ts` (full read),
`frontend/src/scene/three/graphControlSchema.ts`, `frontend/src/scene/sceneController.ts`
(seam surfaces), and the graph-facing store seams
(`frontend/src/stores/view/graphControlsChrome.ts`, the Stage bridges in
`frontend/src/app/stage/Stage.tsx`, `frontend/src/app/stage/GraphControls.tsx`,
`frontend/src/stores/view/selection.ts` projection). Focus on this session's landings:
the emphasis-state grammar (eased recede + cluster fence + set-meta-highlight cutover),
the sim play/pause run-state mirror, and the render-time lerp + fixed-timestep
accumulator + schema retune. Grounded against the accepted stability ADRs (Option-B
freeze, pin survivors, convergence-gated anneal), the emphasis-grammar ADR, and the
sim-smoothness reference. Finding IDs `GPR-###`.

## Findings

### GPR-001 | medium | sim-state mirror can go stale across a Stage unmount and never seeds on mount

The play/pause button reads the `simRunning` chrome-store mirror written only by the
`sim-state` event bridge in `Stage.tsx` (`useSceneSimStateBridge`). The scene is an
app-lifetime singleton but Stage CAN unmount (its renderer is released and rebuilt on
remount), and the field keeps simulating while the canvas host is hidden. A settle
transition emitted while the bridge is unsubscribed is lost, and the bridge performs no
initial-state read on mount — so after a remount the button can render "Pause Layout"
over a settled graph (or "Run Layout" over a live one) until the next genuine
transition. Failure scenario: toggle the graph view off mid-anneal, let it settle
off-screen, toggle back — the control shows running; clicking it then issues a
pointless pause. Fix shape: the controller caches the last emitted `sim-state` in
`emit()` and exposes a `simRunning` read; the bridge seeds the store from it on mount.

### GPR-002 | low | prefers-reduced-motion is re-queried via matchMedia every frame in the display-lerp hot path

`applyDisplayLerp` (`threeField.ts`) calls `prefersReducedMotion()` — a
`window.matchMedia(...)` invocation that allocates a MediaQueryList — once per frame for
the whole run of every settle/anneal. `applyEmphasis` pays the same cost per emphasis
change (harmless) but the per-frame site violates the no-allocations-in-hot-loop
discipline the render loop otherwise follows. Fix shape: hoist one module-cached
MediaQueryList with a change listener; both call sites read the cached boolean.

### GPR-003 | low | solver doc comment contradicts the retuned alphaDecay default (GIR-005 class)

`d3ForceSolver.ts` `D3ForceParams.alphaDecay` doc still reads "default 0.05. With
alphaMin 0.005 this settles in ~100 ticks…" after the deliberate retune to 0.03 (the
schema is the single source of truth and now disagrees with the comment). Same stale-
schedule-comment class GIR-005 already flagged once; the comment must state the current
canonical value or defer to the schema.

### GPR-004 | low | GL context restore force-runs a settled sim: ghost tick, sim-state flicker, redundant persist

The `webglcontextrestored` path unconditionally calls `setRunning(true)` after
rebuilding GL resources. On a SETTLED graph this emits `sim-state{running:true}`, runs
one wasted tick (all nodes pinned), immediately settles back — emitting
`sim-state{running:false}` and re-writing the persisted layout blob. User-visible as a
one-frame play/pause flicker on every context restore; also a spurious storage write.
Fix shape: restore resumes ticking only when the solver is genuinely unsettled and not
frozen.

### GPR-005 | low | GraphSimControl wraps a single button in role="toolbar" with a duplicated label

`GraphControls.tsx` `GraphSimControl` copies the nav-cluster Card chrome including
`role="toolbar"` and a container `aria-label` that duplicates the IconButton's own
label. A one-control toolbar is misleading ARIA (a toolbar groups multiple controls)
and the duplicate label reads twice in a screen-reader walk. Fix shape: drop the role
and container label; the IconButton is self-labelling.

### GPR-006 | info | fence overlay allocates per frame — bounded, accepted

`drawFence` builds a member Set, a points array, and the hull array every rendered
frame while a spotlight is active. Bounded by the cohort (≤ the served node ceiling)
and only while the fence is visible; measured against the existing overlay budget this
is noise, and the perf-degraded fill skip already bounds the worst case. Recorded as
accepted, not actioned — revisit only if the overlay pass shows in the perf LOD.

### GPR-007 | info | verified sound (adversarially re-read, no action)

The anneal cooling ramp still reaches the alphaMin freeze under alphaDecay 0.03 (ramp
lag ≈ slope/decay ≈ 0.017 at release, ~40-tick tail — no infinite simmer). The
fixed-timestep accumulator does not break any solver tick-counter semantics — anneal
budget/stall and sleep dwell counters now normalize toward wall-clock, which is the
intended fix, and `setRunning(true)` resets the accumulator epoch so idle time never
counts as catch-up. `setForceParams` guards `frac > 0`, so echo dispatches cannot
cancel the boot anneal. Physics-truth readers (warm-carry `prevPos`, layout
persistence) correctly read `simPositions`, never the eased display; data swaps and
`diagnose` snap the display; `disposeGraph` resets both buffers and the easing flag so
an empty graph cannot spin the loop. The dragged node is exempt from the display lerp
(no cursor rubber-band). The fence gates on the visibility mask (GS-004 parity) and
degrades to circle/capsule for 1–2 visible members. Camera fit/autoframe read the
display buffer — correct (the camera frames what is on screen) — and `setData`'s fit
runs after the snap. The chrome store normalizes `sim-state` strictly boolean and
resets `simRunning`; the singleton-ring enforcement and the hover→spotlight→selection
emphasis precedence are unchanged. `sim-play` on a null/settled/frozen solver is safe
(no-op / explicit restart / chrome unfreezes first).

## Recommendations

- Fix GPR-001 (controller-cached sim-state + bridge seed) — the one behavioural defect.
- Fix GPR-002/003/004/005 opportunistically in the same pass (hot-path hygiene, stale
  doc, restore-path flicker, ARIA correctness).
- Leave GPR-006 unless the perf LOD implicates the overlay pass.

### Resolution (2026-07-03, same session)

All actionable findings fixed and verified: GPR-001 — `SceneController.emit` caches the
last `sim-state` and exposes a `simRunning` getter; `useSceneSimStateBridge` seeds the
chrome mirror on mount before subscribing. GPR-002 — the reduced-motion MediaQueryList
is created once at module load; the per-frame path reads the live `.matches`. GPR-003 —
the solver's `alphaDecay` doc now defers to the schema registry and names the 0.03
retune. GPR-004 — the context-restore path resumes ticking only when the solver is
genuinely unsettled and unfrozen. GPR-005 — `GraphSimControl` drops the one-button
`role="toolbar"` and duplicate container label. GPR-006 stands as accepted. Full
frontend gate exit 0; 420 scene/stage/store tests green (271 scene re-confirmed after
formatting).
