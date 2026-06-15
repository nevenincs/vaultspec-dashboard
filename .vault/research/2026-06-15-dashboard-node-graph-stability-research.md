---
tags:
  - '#research'
  - '#dashboard-node-graph-stability'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - '[[2026-06-14-graph-representation-adr]]'
  - '[[2026-06-14-graph-representation-research]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-canvas-controls-adr]]'
  - '[[2026-06-13-graph-scale-hardening-adr]]'
---

# `dashboard-node-graph-stability` research: `connectivity-mode stability and Obsidian-parity`

The dashboard's node graph has three representation modes (connectivity, lineage,
semantic). Only the first — the connectivity, Obsidian-like force-directed network —
is in scope here. The data and wire layer (the graph trio: node-semantics, salience,
representation) landed green and serves healthy bounded slices; the breakage the user
reports — flickers, renders unstably, crashes, degrades while glitching through
interactions — lives entirely in the **scene render loop** under `frontend/src/scene/`,
not on the wire. This research produces three things for the downstream ADR: (A) a
verified defect inventory of the current connectivity render pipeline, (B) a grounded
reference on how Obsidian actually achieves its rock-solid graph, and (C) a decision-input
comparison of hardening the existing ForceAtlas2 worker versus adopting a d3-force-style
engine.

## Findings

### A. Verified defect inventory — the current connectivity render pipeline

The connectivity layout runs graphology's ForceAtlas2 in a web-worker singleton
(`fa2.worker.ts`: module-global `graph`, `running`, `timer`). `FieldLayout`
(`layoutWorker.ts`) is the main-thread wrapper; `DashboardField` (`fieldAssembly.ts`)
registers exactly one `onPositions` listener that fans each worker frame out to every
render layer. Every defect below was confirmed against the code. The 20 existing layout
unit tests (`fa2Convergence.test.ts`, `layoutWorker.test.ts`,
`sceneController.representation.test.ts`) all pass, but they exercise only pure units
(convergence math, seed math, controller state) and **never drive the live `onPositions`
loop** — they are blind to exactly the surface that is broken. Green here is not evidence
of a healthy render loop.

**Group A — the per-frame render loop (`onPositions`, runs ~60×/sec while unconverged).**
The single hot listener is monolithic and nothing in it is gated on convergence or on
whether anything actually moved.

- **D1 — Camera auto-fit snaps the world transform every frame (HIGH, the dominant
  flicker).** While `autoFit` is true (the default, re-armed on every `set-data`),
  `onPositions` calls `fitToContent()` which ends in `camera.set(...)` — a hard snap
  (it cancels animation and applies immediately), not a lerp. Each FA2 frame recomputes
  content bounds from the still-moving node cloud; strong repulsion (`scalingRatio:25`)
  expands the cloud frame-by-frame, so the derived scale and center change every frame
  and the camera rescales/recenters ~60×/sec for the whole settle. The field visibly
  "breathes" — zooms and pans — after every load, lens re-query, or mode switch. Scale is
  clamped to ≤1 but the recenter translation is never clamped, so it churns even when
  scale is pinned.

- **D2 — Overlay hull/label geometry recomputed over ALL nodes every frame (HIGH
  degradation).** `onPositions` unconditionally calls `overlayLayer.render(...)`, which
  destroys and rebuilds its label children, runs `featureHulls()` (a per-feature concave
  hull via Andrew's monotone-chain sort, O(M log M)) at document LOD, and **allocates a
  fresh Pixi `Text` per feature per frame** at overview LOD. Pixi `Text` is one of the
  most expensive objects to construct (it builds a texture). At 60fps this is a sustained
  allocation/GC storm plus geometry cost scaling with node count — independent of whether
  motion was meaningful. Labels are torn down and rebuilt each frame, so any sub-pixel
  reflow shimmers.

- **D3 — Full spatial hit-test index rebuilt every frame (MED).** `hitTester.rebuild()`
  clears and re-inserts every node into a grid hash each frame, allocating fresh
  template-literal cell-key strings. Correct while positions move, but never throttled or
  gated on convergence, so it pays full per-frame CPU + GC cost behind the degradation.

- **D4 — No NaN/Infinity guard anywhere on the live frame path (HIGH, the crash).**
  `isFinite` appears only in cache deserialization, sprite/ring/stamp drawing, and tests
  — never on the worker → wrapper → `onPositions` chain. ForceAtlas2 with
  `barnesHutOptimize:true` emits NaN/Infinity on coincident nodes (zero-distance →
  division by zero in the repulsion term) and flings disconnected components toward
  infinity. A single NaN then propagates: into `fitToContent` (NaN bounds →
  `camera.set({scale:NaN,...})` → the Pixi world transform is corrupted → **the entire
  field renders blank/garbage**); into the hit index (a `"NaN:NaN"` bucket → hit-testing
  silently dead); into sprite positions (sprite vanishes); into the minimap (blank). And
  because `computeMaxDisplacement` returns NaN while `NaN < threshold` is `false`, the
  **worker also never converges and spins forever feeding more NaN** — once tripped, it
  does not recover.

- **D7 — Edge-mesh GPU buffer re-uploaded every frame, unbounded by convergence (MED).**
  `edges.update(...)` rewrites every group's Float32 position buffer and calls the GPU
  buffer `update()` per group on every frame, including dashed-segment generation for
  temporal edges and a per-edge `Math.hypot` for quad corners. Correct while moving, never
  gated, so it runs at full rate for the whole settle and compounds the per-frame budget.

**Group B — the worker and convergence (`fa2.worker.ts`, `fa2Convergence.ts`).**

- **D5 — `barnesHutOptimize:true` for a ~12-node constellation (MED, wrong regime).**
  Barnes-Hut is a quadtree far-field approximation meant for large N; the calibration
  comment itself states the regime is a 12-node feature constellation. At that scale it
  buys nothing, adds approximation noise, and its center-of-mass division is the
  zero-distance singularity that triggers D4. Both wrong-regime and the proximate enabler
  of the NaN crash.

- **D6 — Worker re-entry: `init` never stops an in-flight tick loop (HIGH, the thrash).**
  The `init` handler clears the graph, resets convergence, reseeds, and posts a frame, but
  never sets `running=false` nor clears `timer`. Only `stop` clears the timer. The
  connectivity re-layout paths (`applyModelToLayers`, and the connectivity branch of
  `applyRepresentationMode`) call `init()` then `start()` **without** a `stop()` first
  (contrast the deterministic lineage/semantic branch, which does `stop()` then `init()`).
  If a tick loop is already scheduled when `init` lands, it mutates the graph mid-flight
  while the old `setTimeout(tick)` is still queued; the subsequent `start` either no-ops or
  schedules a *second* tick — two self-rescheduling loops then race over one global timer
  handle, the second overwriting the first and orphaning it. Under rapid lens/data/mode
  churn this multiplies tick loops: the graph appears to speed up and thrash, with CPU
  spikes from orphaned loops that never converge or stop.

- **D11 — Coincident seeding sustains a non-settling, NaN-prone layout (MED).** New nodes
  whose neighbors are not yet positioned fall back to the known-centroid seed with only
  ±24 units of jitter; multiple such nodes can seed at effectively the same point. The
  `change`/`params` paths reset convergence on every churn (correct) but, combined with
  coincident seeds feeding zero-distance pairs into Barnes-Hut, keep the layout breathing
  and NaN-prone after repeated incremental updates.

**Group C — lifecycle and re-entrancy.**

- **D8 — Pinned-position overwrite mutates the worker's authoritative frame in place
  (MED).** `onPositions` casts away the `ReadonlyMap` contract and writes pinned coords
  into `this.latest` — the same Map object the wrapper exposes via `get positions()` and
  persists to the cache and warm-starts from. So a pinned node's *display* position
  silently becomes its *seed* on the next re-layout, while the worker's own graph still
  holds the FA2-computed coordinate. Pins are display-fixed per frame but **not** fixed in
  the solver (the worker has no pin concept), so FA2 keeps moving the node internally while
  the overwrite masks it each frame; edges and hit-testing read the overwritten value, the
  next worker frame uses the solver value, and the two fight — pinned nodes jitter or snap.

- **D9 — Async-mount vs destroy/remount race leaves a live-after-mount field null
  (MED).** Pixi v8 `app.init` is async; `DashboardField.mount` sets `assemblyMounted=true`
  synchronously but `onReady` fires later. If a destroy/remount interleaves in that async
  window (StrictMode double-mount, or fast churn), the remount's `base.mount` can no-op
  against a `PixiField` that already fired ready, leaving `layout`/`sprites`/`camera` null
  while the guard believes assembly succeeded — an intermittent dead field on hot-reload or
  fast remount.

- **D10 — Any throw inside `onPositions` or `tick` kills the frame loop (HIGH).** Neither
  the `onPositions` body, the app ticker callback, nor the worker `tick` (around
  `forceatlas2.assign`) is wrapped, and the wrapper's listener fan-out is a bare `for…of`
  with no per-listener guard. A throw in any consumer (a NaN polygon in `overlayLayer`, a
  destroyed-canvas read in the minimap during teardown, a `Text` build failure) aborts the
  rest of that frame's layers; a throw inside the synchronous worker `tick` means the next
  `setTimeout(tick)` is never reached and the **worker tick loop dies permanently** —
  layout freezes mid-motion, unrecoverable without a remount. This is the "renders
  unstably / degrades while glitching through interactions" symptom.

**Net.** The user-visible failure is the sum of an ungated, unguarded, re-entrant
per-frame loop sitting on top of an unstable small-N Barnes-Hut solve: flicker (D1),
degradation (D2/D3/D7), crash/blank (D4), and thrash/freeze under interaction
(D6/D8/D10). The fix surface is consistent regardless of engine choice: gate the
expensive per-frame work on convergence/movement, animate (not snap) auto-fit and disarm
it after the first settle, guard NaN at the worker boundary, drop Barnes-Hut at small N,
make every worker re-init stop-first, and wrap the listener/tick bodies.

### B. Reference — how Obsidian achieves a rock-solid graph

Obsidian's graph core is closed-source and custom-built, but three things are publicly
grounded: it renders on PixiJS/WebGL; it previously used d3 for the simulation; and its
user-facing forces map cleanly onto the standard d3-force model. This reference treats
**d3-force v3.0.0 as the documented, canonical stand-in** for Obsidian's force model —
which is also the correct target to build against.

**The force model and Obsidian's settings mapping.** Obsidian superimposes four forces
that are exactly the d3-force composition. Obsidian's **Link force** is `forceLink`
spring stiffness (degree-normalized strength, distance default 30); **Link distance** is
the spring rest length; **Repel force** is `forceManyBody` (negative strength, default
−30, Barnes-Hut `theta` 0.9, `distanceMin` 1, `distanceMax` ∞); **Center force** is per-node
gravity. A tunable center slider is best modeled by `forceX(0)`+`forceY(0)` with an
adjustable strength (default 0.1) — a real per-node pull — rather than `forceCenter`,
which only translates the whole node mean to the target and exerts no per-node force.
`forceCollide` (radius, strength, iterations) gives clean non-overlap. Capping
`distanceMax` (e.g. ~400–500) stops disconnected islands from drifting off-screen.

**The cooling schedule — the single key to "rock-solid".** d3-force is simulated
annealing: an `alpha` temperature ∈ [0,1] that monotonically cools to a stop. Each
`tick()`: `alpha += (alphaTarget − alpha) × alphaDecay`; apply each force scaled by
`alpha`; damp velocity by `velocityDecay`; integrate (velocity Verlet). Defaults: `alpha`
1, `alphaMin` 0.001, `alphaDecay` ≈0.0228 (= `1 − pow(0.001, 1/300)`, so ~300 ticks to
settle), `alphaTarget` 0, `velocityDecay` 0.4. Because every displacement is multiplied by
`alpha` and `alpha → 0`, per-tick motion shrinks geometrically to nothing; `velocityDecay`
bleeds off momentum so residual oscillation is killed twice over. Below `alphaMin` the
internal timer halts and an `'end'` event fires — **the layout is frozen at zero CPU**.
Reheating on drag or graph change sets `alpha` back up (`alpha(1).restart()` for a full
re-layout, or hold `alphaTarget(0.3)` during a drag, then return `alphaTarget(0)` to
re-cool). This cooling-to-freeze lifecycle is precisely what ForceAtlas2 lacks: graphology
FA2 has no alpha, no cooling, and no convergence detection — it runs a fixed iteration
count, which is the structural reason it jitters and why the current worker had to bolt on
its own `ConvergenceDetector`.

**Robustness techniques mature renderers rely on.** (1) **Coincidence/NaN safety via
`jiggle`:** d3 substitutes a deterministic `(random()−0.5) × 1e-6` perturbation whenever a
coordinate delta is exactly zero, inside `forceManyBody`, `forceLink`, and `forceCollide`
— imperceptible, but it breaks the zero-distance singularity so the math stays finite. Any
custom force must do the same. (2) **Never seed at the origin:** all-nodes-at-(0,0) is the
canonical instability trigger (FA2 documents it as a hard failure); d3 seeds on a
golden-angle **phyllotaxis spiral** (`initialRadius` 10, `initialAngle` π(3−√5) ≈ 2.39996
rad; for node *i*: `radius = 10·sqrt(0.5+i)`, `angle = i·initialAngle`) — deterministic,
evenly spread, never coincident. (3) **Velocity damping over hard clamping** — with proper
cooling a max-velocity clamp is rarely needed; it earns its keep only when there is *no*
cooling (FA2's situation). (4) **Fit the camera ONCE on settle, then hand it to the
user** — the correct pattern is to run the sim, call `zoomToFit()` a single time on the
`end`/engine-stop event, and thereafter leave the camera user-owned; refitting per-tick is
the seasick "camera chasing the layout" bug, which is exactly D1. In this codebase's layer
model that fit-once decision belongs in the scene/view layer. (5) **Decouple sim tick from
render frame, and pause redraw when frozen** — read positions and draw on rAF; when `alpha
< alphaMin`, stop redrawing (mature renderers' `autoPauseRedraw`), dropping idle CPU to
~zero, and re-arm on reheat. (6) For ≤ a few hundred nodes the sim is cheap enough to run
**on the main thread**; workers matter only at 10k–50k+ nodes (sim in worker, positions
interpolated on the main thread), and GPU-resident simulation is for 100k–1M nodes — both
overkill at this scale.

**d3-force API specifics a TS implementer needs.** The internal timer auto-starts on
`forceSimulation(nodes)` and fires `'tick'`/`'end'`; wire the PixiJS redraw to `on('tick')`
for live animation and `on('end')` to fit-once and pause. A gotcha: `simulation.tick(n)`
advances synchronously and dispatches **no** events — use it only for precomputed static
layouts. Pin a node by setting `node.fx`/`node.fy` (d3 resets `x=fx`, `vx=0` each tick);
unpin by clearing them. Warm-start by pre-setting each node's `x`/`y` from the last frame
**before** building the simulation and starting at a lower `alpha` (≈0.3) so the existing
layout nudges instead of exploding — this is what makes lens re-queries feel stable. On
graph change, swap `nodes`/`links` then `alpha(target).restart()`.

### C. Decision input — harden ForceAtlas2 vs adopt d3-force

The user chose to research both and let the ADR commit. Both engines need the **same
render-loop fixes** from Section A (gate per-frame work, animate-and-disarm auto-fit, NaN
guards, stop-first re-init, wrapped bodies) — that work is engine-independent and is the
bulk of the stability win. The engine question is narrower: which solver core best matches
the Obsidian-parity bar with the least bolt-on machinery.

| Parity requirement | graphology ForceAtlas2 | d3-force v3 |
| --- | --- | --- |
| Settle-then-freeze (no perpetual jitter) | Absent — fixed iterations; must hand-build cooling + convergence (already partly bolted on) | Native: alpha cooling + `'end'`/freeze |
| Warm-start on lens re-query | Re-seed + re-run iterations manually | Native: pre-set `x/y`, start at low `alpha` |
| Pin / drag-to-pin / reheat | No pin concept (D8 is this gap); re-fix each iteration manually | Native `fx/fy` + `alphaTarget` reheat |
| Coincidence/NaN safety | Hard `x=y=0` failure; small-N Barnes-Hut NaN risk (D4/D5) | Native `jiggle` (1e-6) in every core force |
| Small-N stability (12–few hundred) | Barnes-Hut over-engineered at this scale | Exact-enough; trivial cost |
| Cluster-readability aesthetics | `linLogMode`, `outboundAttractionDistribution`, `strongGravityMode`, `edgeWeightInfluence` | Compose via `forceX/Y`, `forceCollide`, custom forces |
| Scale ceiling | CPU-bound; needs GPU beyond ~50k | Hits a wall ~50k (not relevant at this scale) |

**Harden-FA2 path.** Keep the worker, the Vite-native worker URL pattern, the warm-start
seeding, and the existing protocol/tests; add the Section-A render-loop fixes plus an
external cooling/convergence loop (decay effective step toward a floor, freeze on a
movement threshold), disable Barnes-Hut at small N, add coincidence jitter and a velocity
clamp, and implement pinning by re-fixing positions each iteration. Lower migration risk
and reuses the worker scaffolding, but it is essentially re-implementing d3-force's
cooling, pinning, and singularity handling on top of FA2 — the very machinery d3 ships
natively — and D8's pin-fighting and D5's small-N instability are inherent to the FA2
core, not just the loop around it.

**Adopt-d3-force path.** Replace the FA2 solver with a d3-force simulation
(`forceLink`+`forceManyBody`+`forceX/Y`+`forceCollide`, d3's default cooling) and migrate
warm-start (pre-set `x/y` + `alpha(0.3)`), pinning (`fx/fy`), and the worker/main-thread
decision (main-thread is viable at this scale, simplifying the architecture). Higher
up-front change — a new solver, re-pointing the layout protocol, and porting the worker
tests — but the settle-then-freeze, warm-start, pinning, and NaN-safety that the parity
bar demands all come for free, and the result is the documented model behind Obsidian's own
graph. Concrete starting parameters for a ~12–300-node second-brain graph:
`forceLink.distance` ~40 / `.strength` ~0.4; `forceManyBody.strength` −120 (−80…−300 for
breathing room at low N), `theta` 0.9, `distanceMax` ~500; `forceX/Y(0).strength` ~0.06;
`forceCollide.radius` = node radius + ~4, `.strength` ~0.8; keep d3's default
`alphaDecay` 0.0228 / `velocityDecay` 0.4 fixed and **not** user-exposed (fixing them is
what guarantees the always-settles property). Expose only the Obsidian knob set — Repel
(`forceManyBody.strength`), Link force (`forceLink.strength`), Link distance
(`forceLink.distance`), Center (`forceX/Y.strength`) — which the existing AlgorithmPanel /
canvas-controls surface already anticipates.

**Recommendation for the ADR.** The render-loop hardening is mandatory and engine-neutral;
do it regardless. On the solver, the evidence favors **adopting d3-force**: it ships the
exact lifecycle (cooling-to-freeze, warm-start, pinning, jiggle) that the Obsidian-parity
bar requires and that the harden-FA2 path would have to re-build by hand, and it dissolves
two root-cause defects (D8 pin-fighting, D5 small-N Barnes-Hut) rather than papering over
them. The harden-FA2 path remains the lower-risk fallback if the ADR weights migration cost
and test churn above parity fidelity. Either way the scope stays bounded to the
connectivity mode; lineage and semantic remain deterministic seed layouts the solver is
stopped over, unchanged.
