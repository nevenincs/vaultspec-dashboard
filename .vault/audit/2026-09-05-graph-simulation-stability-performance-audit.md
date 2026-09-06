---
tags:
  - '#audit'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:743b56e88c88b5d6302c46298b77bbe162e83d437a4031c806d729af5ff9aa01'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
  - "[[2026-09-05-graph-simulation-stability-performance-reference]]"
---

# `graph-simulation-stability` audit: `performance`

## Scope

Audit requested after the force-balance drift fix. Review covers CPU forces, the simulation clock, graph replacement, render and interaction work, and allocation/resource bounds. The related performance reference owns fixtures, measurements, environment, and reproduction details. This audit records findings and follow-up recommendations; no production optimization is authorized or implemented by this audit.

## Findings

### catch-up-long-tasks | high | Fixed-step catch-up amplifies CPU overload

Open. `frontend/src/scene/three/threeField/simulation.ts` runs up to three complete synchronous solver ticks before painting. A tick-count cap is not a CPU-time bound. The measured cold-to-live fixture reaches multi-hundred-millisecond callbacks, so input cannot remain responsive at the supported large-graph size. The prewarm wall-clock guard also checks between indivisible ticks and can overshoot its nominal budget. Preserve fixed-step force semantics, but establish a bounded host scheduling policy and measure input latency under overload.

### charge-hot-path | high | Reciprocal repulsion remains too costly for large cold layouts

Open. `frontend/src/scene/three/symmetricManyBody.ts` preserves the drift correction but its ordinary impulse path performs a square root and multiple divisions per interaction. A browser-only arithmetic prototype materially reduces time with roundoff-scale velocity differences on the tested ordinary fixtures. Cutoff-boundary-heavy cold layouts remain expensive even with this change. Optimize without restoring one-sided forces, mismatched masses, extra damping, or stronger cooling. The prototype is evidence for a candidate, not a verified implementation.

### unchanged-rebuild | medium | Zero-tick updates still reconstruct solver and GPU resources

Open. `frontend/src/scene/three/threeField/data.ts` disposes and reconstructs the graph before the warm-swap classifier can avoid simulation ticks. An identical frozen update still replaces the solver, geometry, attributes, and position texture. Separate topology/physics invalidation from appearance-only changes, preserving identity, pin state, selection, and derived cache invalidation. Merely comparing array identity is insufficient.

### style-lookup-per-node | medium | Graph construction repeats computed-style reads per node

Open. Node color construction calls the CSS conversion path per node. Instrumentation confirms node-count-proportional `getComputedStyle` calls. Cache resolved theme tokens for a graph build or theme revision, retaining correct invalidation on theme changes. This is a likely low-risk improvement to the rebuild path, not the primary simulation bottleneck.

### sleeping-work | high | Local drags compute nearly the full force field

Open. `frontend/src/scene/three/d3ForceSolver.ts` pins sleeping nodes but still evaluates every force over all nodes. `frontend/src/scene/three/symmetricManyBody.ts` has no cell mobility metadata; `frontend/src/scene/three/d3ForceMass.ts` rejects zero-mobility contacts only after geometric work. The measured naturally settled fixture remains expensive with one free node and one held node. Retain sleepers as force sources and obstacles, but investigate pruning interactions whose outputs are entirely discarded by fully pinned endpoints. Do not blindly skip pinned-pinned d3 links: their intermediate velocities can influence later links before integration resets them. Preserve per-axis pins and deterministic coincident handling.

### collision-candidates | medium | Collision work grows sharply with dense packing

Open. The global maximum-diameter grid in `frontend/src/scene/three/d3ForceMass.ts` generates one insertion key and nine neighbor lookup keys per node per iteration, traverses candidate lists before the pair-index filter, and repeats padded-radius and inverse-mass calculations. Dense fixtures spend materially more time here than sparse ones. Cache initialization-only values first, then benchmark numeric cell keys or unique occupied-cell pair traversal with explicit coordinate bounds. Larger changes must preserve contact order or account for its behavioral effect; one oversized node can inflate grid occupancy. Fully coincident geometry still has quadratic pair work, so the frontend count limit alone does not bound tick latency.

### overlay-derived-work | low | Bounds, picks, and minimap repeat derived geometry work

Open. `frontend/src/scene/three/threeField/viewport.ts` recomputes all radii and bounds during autoframe polling and every minimap render, including camera-only changes. `frontend/src/scene/three/threeField/interaction.ts` recomputes radii during uncached picks; `frontend/src/scene/three/appearance.ts` allocates degree-value arrays along this path. These costs are measurable but much smaller than simulation on the audit machine. Cache world radii by data/appearance revision and bounds by displayed-position/visibility/radius revision. A minimap dot layer can be invalidated independently of its viewport rectangle. Preserve subpixel pick caching, which already works.

### render-only-lod | medium | The adaptive performance signal excludes the dominant solver work

Open. `frontend/src/scene/three/threeField/simulation.ts` measures only `renderFrame()` for its cost EMA. This is CPU render submission plus overlays, not total frame time or GPU duration. Long simulation callbacks therefore coexist with a healthy render-only EMA and no degradation. Expose separate solver, total callback, frame-spacing, and render-submission metrics. Do not respond to CPU force overload merely by lowering pixel ratio; choose the overloaded subsystem's scheduling/workload policy.

### retune-allocation | low | Parameter-only edits rebuild unrelated force state

Open, static finding rather than a measured allocation profile. `D3ForceSolver.setParams` recreates charge, collision, and centering forces even for damping/cooling-only changes; the new kernels allocate node-proportional typed arrays on initialization. Update only affected forces or retain their buffers across equivalent-size reinitialization. Preserve reheat behavior and drag cancellation. Also avoid repacking/uploading unchanged positions on zero-tick high-refresh callbacks unless display interpolation actually changes them. The mass wrapper's extra passes were not a measurable leading cost, so removing that clear correctness boundary is not a priority.

### pruning-rng-order | medium | Skipping discarded interactions can still change shared random state

Open, correctness constraint on `sleeping-work` and `collision-candidates`, not an additional measured runtime cost. Coincident contacts consume the initialized random source before the zero-mobility exit, and d3 forces share simulation RNG state. Preserve draw consumption/order where trajectory equivalence is required, or explicitly document and regression-test the changed trajectories. Repeatability alone is weaker than preserving the existing simulation behavior.

### cpu-increment-disposition | low | Implementation disposition after the authorized performance increment

The earlier entries record the original audit state. The subsequent authorized CPU increment resolves `unchanged-rebuild`, `style-lookup-per-node`, `sleeping-work` and the `pruning-rng-order` constraint through strict compatibility reuse, per-build token reads and output-discard pruning with coincidence-order oracles. It addresses the ordinary arithmetic and cached/eligible candidate portions of `charge-hot-path` and `collision-candidates`. It resolves catch-up amplification and the missing subsystem measurements in `catch-up-long-tasks` and `render-only-lod`, but does not eliminate an over-budget individual tick or synchronous prewarm overshoot. The production results reference owns the measured gains and their limits.

The low-priority `overlay-derived-work` and force-retune allocation portion of `retune-allocation` remain deferred: they were not leading costs in this increment. Zero-tick pack/upload suppression is implemented. Fully coincident work remains quadratic, and large cold layouts remain CPU-bound. An off-thread solver, new force approximation, broader device coverage, sustained memory profiling and dedicated delta-reflow/retune timing are follow-up work, not claims of this increment.

## Recommendations

The original prioritization below is retained as the audit trail; the implementation disposition above identifies completed and deferred portions.

Prioritize `charge-hot-path`, `sleeping-work`, and `catch-up-long-tasks`: reduce ordinary impulse arithmetic, make inactive-region force work avoidable, and establish a scheduling policy that does not multiply an already slow tick into a long input-blocking callback. A one-tick-per-callback cap alone is insufficient when one tick exceeds the frame budget. Do not confuse dropping elapsed time with preserving both simulation throughput and responsiveness.

Next address `collision-candidates`, `unchanged-rebuild`, and `style-lookup-per-node`. Defer the smaller `overlay-derived-work` and `retune-allocation` changes until profiling confirms they matter for the target device and workload. Address `render-only-lod` with separate metrics for solver time, total callback duration, frame spacing, and CPU render submission; tune the subsystem that is actually overloaded.

Any worker/off-thread move, new force approximation, or changed clock-overload contract requires a follow-on ADR deciding ownership, synchronization, cancellation, correctness/error bounds, and overload semantics before implementation. This audit does not make those architectural decisions. Cache and arithmetic candidates also need the existing conservation, cutoff/extreme-coordinate, deterministic seeding, per-axis pin, local drag, release, freeze, warm-swap, and lifecycle regression tests as appropriate.

Add a repeatable dev-domain performance harness with representative backend-derived fixtures and explicit size/density/active-count dimensions. Establish supported-device callback/input-latency and settle-throughput budgets, then validate a production build against them. Record separate idle, cold-layout, local-drag, delta-reflow, and retune results. Do not call a microbenchmark speedup a whole-application improvement.

No production files changed during this audit. The arithmetic prototype existed only in an isolated browser module. Measurements and the documented coverage gaps support a targeted optimization pass, not an all-optimized certification.
