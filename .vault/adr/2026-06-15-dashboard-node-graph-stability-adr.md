---
tags:
  - '#adr'
  - '#dashboard-node-graph-stability'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-15-dashboard-node-graph-stability-research]]"
  - "[[2026-06-14-graph-representation-adr]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
  - "[[2026-06-14-dashboard-canvas-controls-adr]]"
  - "[[2026-06-13-graph-scale-hardening-adr]]"
---

# `dashboard-node-graph-stability` adr: `d3-force connectivity solver + render-loop hardening` | (**status:** `accepted`)

## Problem Statement

The dashboard's node graph offers three representation modes; the first — the
connectivity, Obsidian-like force-directed network — is the default and is broken. The
user reports it flickers, renders unstably, crashes, and degrades while glitching through
interactions. The companion research verified eleven concrete defects (D1–D11), all in the
scene render loop, not on the wire: a per-frame camera auto-fit that hard-snaps the world
transform ~60×/sec (the dominant flicker), feature-hull and label geometry plus a full
spatial hit-index and every edge's GPU buffer all recomputed every frame (the
degradation), no NaN guard anywhere so a single bad solver coordinate corrupts the camera
transform and blanks the field while the solver spins forever (the crash), a ForceAtlas2
worker whose `init` never stops an in-flight tick loop so rapid lens/data churn races
multiple self-rescheduling loops (the thrash), pinned positions overwritten into the
solver's own frame so pins fight the solver, and unguarded tick/listener bodies where one
throw kills the loop. The graph data layer (the semantics/salience/representation trio)
already landed green and is not in question. This ADR decides how to make the connectivity
render rock-solid and on par with Obsidian, scoped strictly to that one mode.

## Considerations

The research established that the per-frame render-loop fixes are **engine-neutral** — they
must happen regardless of solver — and that the solver question is narrower: which core
best matches the Obsidian-parity bar with the least bolt-on machinery. Obsidian's graph is
a d3-force-style simulation rendered on PixiJS; its "rock-solid then still" feel comes from
d3-force's **alpha cooling schedule** (a simulated-annealing temperature that decays to a
freeze, killing residual jitter twice over via alpha-scaled displacement and velocity
damping), plus native warm-start, `fx`/`fy` pinning with reheat, and a `jiggle` (1e-6)
perturbation that dissolves the coincident-node singularity. graphology's ForceAtlas2 has
none of this: no alpha, no cooling, no convergence detection — it runs a fixed iteration
count, which is the structural reason the current worker had to hand-roll a
`ConvergenceDetector` and still jitters, and why `barnesHutOptimize` (wrong regime at a
~12-node constellation) is the proximate NaN trigger.

Two facts from the codebase narrow the choice. First, `graphology` and
`graphology-layout-forceatlas2` are imported by exactly one module — the FA2 worker — so
retiring FA2 retires those dependencies cleanly with no other call site. `d3-force` is not
yet a dependency (only `d3-ease` / `d3-interpolate` are present); it is a small, pure,
framework-free, battle-tested addition that fits the scene layer's no-React rule. Second,
the served connectivity slice is **bounded by default** (the graph-scale-hardening
guarantee): the constellation LOD is feature-count-bounded and document granularity is
capped at a hard node ceiling, so on-screen node counts are in the hundreds — a regime where
a d3-force tick costs well under a millisecond on the main thread.

## Constraints

- **d3-force maturity / risk:** d3-force v3 is mature, pure JavaScript, framework-free, and
  well within the implementing model's training cutoff. No frontier risk. Its transitive
  deps (`d3-quadtree`, `d3-dispatch`, `d3-timer`) are tiny and equally established. The
  frontend wheel-purity concern in the project rules is Python-specific (rag/torch) and does
  not apply to an npm layout library.
- **Main-thread decision depends on the bounded-query guarantee.** Running the simulation on
  the main thread is sound only because connectivity slices are LOD-bounded. If that
  guarantee ever weakened (an unbounded slice reaching the renderer), a large cold settle
  could jank the main thread. The documented mitigation is to move the same d3-force
  simulation behind a worker — the seam is designed to allow it — but v1 is main-thread.
- **Parent stability:** the graph trio (`graph-representation`, `graph-node-semantics`,
  `graph-node-salience`) is the stable parent. This ADR consumes its served fields
  (salience-driven size, authority class, feature membership) and the bounded-LOD wire
  unchanged; it adds no wire surface and touches no engine code. Stable.
- **Downstream consumers require amendment:** `dashboard-canvas-controls` (the
  AlgorithmPanel) and `dashboard-node-canvas` expose and consume the current FA2 parameter
  vocabulary; the parameter change below is a contract event for them, handled in this
  feature's plan.

## Implementation

The decision is to **adopt d3-force as the connectivity solver, retiring the graphology
ForceAtlas2 worker, and to run the simulation on the main thread behind the existing layout
seam**, combined with the engine-neutral render-loop hardening. Ten decisions:

**D1 — Engine: d3-force replaces graphology ForceAtlas2.** The connectivity solver becomes a
d3-force simulation composed of a link force, a many-body (charge) repulsion, per-node
centering on the X and Y axes, and a collision force for clean non-overlap. `graphology` and
`graphology-layout-forceatlas2` retire with the FA2 worker (their only call site).

**D2 — The simulation runs on the main thread, retiring the worker.** Because the served
slice is bounded, the worker's off-thread benefit is not needed and its cost is real: the
worker re-entry race (defect D6), the message protocol, and the drag-to-pin round-trip
latency all disappear on the main thread. The existing layout interface — initialize,
start, stop, set-params, on-positions, positions snapshot, destroy — is **preserved as the
seam**, so the field assembly that drives it is minimally touched; only the implementation
behind the seam changes from a worker wrapper to a d3-force driver. The on-positions
listener becomes the simulation's tick handler.

**D3 — The cooling lifecycle is the stability contract.** The simulation uses d3's alpha
cooling to settle and then freeze at zero CPU; the cooling parameters (alpha decay, velocity
decay, alpha floor) are **fixed in code and never user-exposed**, because fixing them is
precisely what guarantees the layout always settles. A new slice or lens re-query reheats
gently from the warm-started positions (a low alpha) rather than a full cold reshuffle; an
active drag reheats while held and re-cools on release.

**D4 — Per-frame render work is gated on the simulation clock.** The render layers update on
the tick event only while the simulation is unconverged; when it freezes, the per-frame
cascade ceases (the pause-redraw parity behaviour). The three per-frame offenders — overlay
hull/label recomputation, full hit-index rebuild, and edge GPU buffer re-upload — are driven
by tick and stop at freeze, and additionally recompute only when positions actually moved.

**D5 — Camera: fit once on settle, then user-owned.** The per-frame `camera.set` snap is
removed. Auto-fit becomes a one-shot: on the first settle the camera animates once to the
content bounds, then auto-fit disarms permanently for that slice and the user's pan/zoom
owns the camera thereafter. A new slice re-arms the one-shot. This decision lives in the
scene/view layer, per the dashboard layer-ownership boundary — it is not a wire or stores
concern.

**D6 — NaN and coincidence safety.** d3-force's internal jiggle handles coincident nodes
natively inside the core forces, and cold nodes seed on a deterministic phyllotaxis spiral
(never the origin) with warm-started nodes carried over verbatim. As belt-and-suspenders, a
finite-coordinate guard at the position-read boundary repairs or drops any non-finite value
before it can reach the camera transform, the hit index, or the sprites — so no single bad
coordinate can corrupt the world or wedge the loop.

**D7 — Pinning is solver-level.** The display-overwrite hack that mutated the solver's own
position frame is removed; a pinned node fixes its coordinates in the simulation itself
(the `fx`/`fy` mechanism), so the solver holds it and nothing fights. Drag-to-pin fixes and
reheats; release returns the simulation toward freeze, and sticky pins keep their fix.

**D8 — The tick and listener bodies are guarded.** The simulation tick and the
position-listener fan-out are wrapped so one throwing consumer cannot kill the whole loop;
combined with the main-thread move (no async worker-init window) this also closes the
mount/destroy race that could leave a live-after-mount field null.

**D9 — The parameter vocabulary becomes the Obsidian knob set.** The user-facing controls
become Repel force, Link force, Link distance, and Center force — mapping directly onto the
d3 many-body strength, link strength, link distance, and X/Y centering strength. The FA2
vocabulary (scaling ratio, gravity, slow-down, Barnes-Hut toggle) retires. This amends the
AlgorithmPanel and the layout-parameter command on the scene controller; starting values
come from the research (the Obsidian-parity parameter table).

**D10 — Scope fence.** Connectivity mode only. Lineage and semantic remain deterministic
seed layouts: they set explicit node positions and the simulation is held stopped over them,
exactly as today. Mode-switch object constancy (id-keyed nodes, no re-keying) is preserved
so transitions animate from prior positions.

## Rationale

The research recommended d3-force, and the codebase facts strengthen rather than complicate
that recommendation. d3-force ships the exact lifecycle the Obsidian-parity bar demands —
settle-then-freeze cooling, warm-start, solver-level pinning, and singularity-safe forces —
that the harden-FA2 alternative would have to re-implement by hand on top of a core that
lacks all of it; and two of the verified root-cause defects (the small-N Barnes-Hut
instability D5 and the pin-fighting D8) are inherent to the FA2 core, not just the loop
around it, so hardening FA2 would paper over them rather than dissolve them. Because
graphology is used nowhere else and the served slice is bounded, the change is contained: a
single-module solver swap, a main-thread simplification that deletes a whole class of
worker-race bugs, and a parameter-vocabulary amendment to two known consumers. The harden-FA2
path remains the honest lower-risk fallback if migration cost is weighted above parity
fidelity, but it buys less and leaves the FA2-inherent defects standing.

## Consequences

**Gains.** The flicker (per-frame camera snap), the degradation (ungated per-frame
recompute), the crash (unguarded NaN), the thrash (worker re-entry race), and the
pin-fighting are each addressed at the root rather than mitigated. Idle CPU drops to ~zero
when the layout freezes. Drag-to-pin is immediate (no worker round-trip). The control surface
becomes the familiar Obsidian knob set. The architecture shrinks (no worker, no message
protocol, no hand-rolled convergence detector).

**Difficulties.** It is a solver replacement, not a patch: the layout driver behind the seam
is rewritten, the parameter vocabulary changes across the controller command and the
AlgorithmPanel, and the existing worker-oriented layout tests must be ported to the
main-thread driver. The main-thread choice is correct only under the bounded-slice
guarantee; if a future change served an unbounded slice, a large cold settle could jank, and
the mitigation (the same simulation behind a worker) would need to be built then.

**Pathways opened.** A single, well-understood force model makes future parity features
(drag-to-pin persistence, neighbour-focus reheat, link-distance-by-relation, settle
animation tuning) straightforward, and the fixed-cooling discipline gives a stable base the
lineage and semantic modes can later borrow for their own transitions.

## Codification candidates

- **Rule slug:** `scene-render-work-is-gated-on-the-layout-clock`.
  **Rule:** Per-frame scene work — camera auto-fit, overlay/hull recompute, hit-index
  rebuild, edge GPU upload — runs only while the layout simulation is unconverged and ceases
  when it freezes; auto-fit fits once on the first settle and the camera is user-owned
  thereafter, never refit per frame.

- **Rule slug:** `force-layout-cooling-is-fixed-never-exposed`.
  **Rule:** The force-layout cooling schedule (alpha decay, velocity decay, alpha floor) is
  fixed in code and never surfaced as a user control; only the force knobs (repel, link
  force, link distance, center) are tunable, because fixing the cooling is what guarantees
  the layout always settles to a still state.

(Both are candidates only — per the codify discipline they are promoted to rules after they
hold across a full execution cycle, not on first authoring.)
