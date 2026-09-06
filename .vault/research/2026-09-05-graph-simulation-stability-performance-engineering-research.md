---
tags:
  - '#research'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:06a0fcc38f9d4a7152468dfeef6184e74bf179168e6e3a4bb25db64adb2557fb'
related:
  - "[[2026-09-05-graph-simulation-stability-performance-reference]]"
  - "[[2026-09-05-graph-simulation-stability-performance-audit]]"
  - "[[2026-07-03-graph-simulation-stability-adr]]"
  - "[[2026-06-29-graph-simulation-stability-adr]]"
---

# `graph-simulation-stability` research: `performance engineering`

The question is how to reduce active simulation cost without undoing the force-balance correction or pin-authoritative interaction model. The measured evidence favors a correctness-preserving CPU optimization increment, with explicit overload semantics, before considering a worker migration. The related performance reference owns measurements and source feasibility; this document compares engineering options. Approval and execution state belong to the governing ADR and plan.

## Findings

### Existing decisions favor amendment rather than replacement

`2026-07-03-graph-simulation-stability-adr` already governs reciprocal forces, degree mass, fixed-step scheduling, bounded anneal, and persistence. `2026-06-29-graph-simulation-stability-adr` governs survivor pinning and position authority. Optimizing those mechanisms fits an amendment to the July record while preserving the June contract. A new competing accepted ADR would fragment ownership. A worker ownership change would need a separately reviewed decision rather than being hidden inside arithmetic tuning.

### Conservative pruning offers a local-drag improvement without a new force law

The performance reference's engineering follow-up identifies a fixed-cell pruning candidate that leaves source geometry and movable interactions intact. This is preferable to deleting sleeping nodes from the source tree, which would change the forces on awake nodes. Per-axis pin mobility, force order, contact accumulation order, and shared RNG state remain essential constraints. Retaining overlapping/self traversal limits the optimization on pathological coincident layouts but avoids inventing a new random process. Arithmetic fast paths and initialization-only collision caches offer additional candidates within the same force contract. Neither candidate has completed differential regression or post-change benchmarking.

The alternative of coarser theta, a changed cutoff, weaker collisions, or stronger cooling would change the layout behavior and confound the performance comparison. The evidence does not justify those changes for this increment. Sources: `2026-09-05-graph-simulation-stability-performance-reference`, especially arithmetic prototype and engineering feasibility; `frontend/src/scene/three/symmetricManyBody.ts:116`; `frontend/src/scene/three/d3ForceMass.ts:106`.

### Overload policy must distinguish executed ticks from elapsed time

A soft CPU budget checked between complete ticks can reduce catch-up amplification, but cannot interrupt a single expensive tick. Retaining all missed wall time risks an accumulating backlog; discarding excess whole-step debt bounds lag but makes settling slower in wall-clock time. The evidence favors explicit discard under overload, preserving fractional elapsed time and exact per-executed-tick physics, with normal refresh-independent cadence while within budget. An approval must authorize that trade-off. A hard responsiveness guarantee would instead require interruptible work or off-thread ownership; neither follows from a host budget alone. Sources: `frontend/src/scene/three/threeField/simulationClock.ts:13`; `frontend/src/scene/three/threeField/simulation.ts:379`; the performance reference's full-scene measurements.

### Reuse must distinguish physics identity, attributes, and command effects

Array identity or the swap classifier's unordered edge sets are insufficient reuse keys. Ordered node/index identity, resolved edge order and multiplicity, radii, and force inputs determine solver compatibility. Attribute-only changes can potentially reuse the solver and position texture while updating affected GPU attributes and derived metadata. Genuine topology changes, explicit reset, empty transitions, and context restoration require their existing lifecycle handling. Selection, visibility, gesture cancellation, pending focus, camera arbitration, and settled versus in-flight state cannot disappear behind an early return. Sources: the performance reference's engineering feasibility follow-up; `frontend/src/scene/three/threeField/data.ts:244`; `frontend/src/scene/three/threeField/gpuResources.ts:550`.

Build-scoped theme resolution has a smaller and clearer invalidation surface than a global color cache. Radius and bounds caching is also feasible but lower priority than force work. Sources: `frontend/src/scene/field/tokenReads.ts:55`; the related performance audit's rebuild and overlay findings.

### Worker migration remains an escalation option, not a demonstrated speedup

The current solver and scene consume commands synchronously. Moving simulation off-thread would require explicit graph generations, command ordering, drag/release reconciliation, transferable buffer ownership, stale-result rejection, cancellation, failure handling, and teardown bounds. It could isolate main-thread responsiveness without making each force evaluation faster. The present audit did not benchmark that design, so worker throughput and input-latency claims remain unverified. Sources: `frontend/src/scene/three/threeField/data.ts:36`; `frontend/src/scene/three/threeField/simulation.ts:362`; `2026-07-03-graph-simulation-stability-adr`, considered option D.

### Acceptance needs separate correctness and performance evidence

A repeatable dev-domain harness should compare the unmodified baseline with each candidate on cold, dense, sparse, naturally settled local-drag, delta, and retune workloads. Force tests need differential free-coordinate outputs and RNG state, per-axis pins, mass-weighted conservation, cutoff boundaries, and extreme/coincident coordinates. Host tests need executed/discarded tick accounting and lifecycle equivalence. Performance needs separate tick throughput, total callback duration, actual input latency, rebuild cost, and retained-resource observations on a clean production mount. These are recommended verification dimensions, not achieved results or promised budgets. The existing performance reference lists the coverage gaps; the intended target-device budgets still need to be stated in the authorizing decision and implementation plan.

## Sources

- `2026-09-05-graph-simulation-stability-performance-reference` and `2026-09-05-graph-simulation-stability-performance-audit`.
- `2026-07-03-graph-simulation-stability-adr` and `2026-06-29-graph-simulation-stability-adr`.
- `frontend/src/scene/three/symmetricManyBody.ts:116` and `frontend/src/scene/three/d3ForceMass.ts:106`.
- `frontend/src/scene/three/threeField/simulationClock.ts:13` and `frontend/src/scene/three/threeField/simulation.ts:362`.
- `frontend/src/scene/three/threeField/data.ts:36`, `:244`, and `frontend/src/scene/three/threeField/gpuResources.ts:550`.
- `frontend/src/scene/field/tokenReads.ts:55`.

Discovery note: both semantic-search interfaces refused requests because installed client 0.4.1 and shared service 0.4.23 differed. Existing vault discovery, governing records, and direct source reads supplied the grounding. The shared service was not restarted.
