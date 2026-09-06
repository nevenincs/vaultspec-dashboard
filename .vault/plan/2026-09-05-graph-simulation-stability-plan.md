---
tags:
  - '#plan'
  - '#graph-simulation-stability'
date: '2026-09-05'
tier: L1
related:
  - '[[2026-07-03-graph-simulation-stability-adr]]'
  - '[[2026-06-29-graph-simulation-stability-adr]]'
  - '[[2026-09-05-graph-simulation-stability-force-balance-reference]]'
  - '[[2026-09-05-graph-simulation-stability-force-balance-audit]]'
  - '[[2026-09-05-graph-simulation-stability-performance-reference]]'
  - '[[2026-09-05-graph-simulation-stability-performance-engineering-research]]'
modified: '2026-09-06'
body_schema: body-v2
body_hash: 'sha256:4a4301c6fee3fb60ace222392579c7a8be5b80c42298c82ec1a0af3bde4240fd'
---

# `graph-simulation-stability` plan

## Description

Correct cluster propulsion through consistent degree-based inertia and symmetric repulsion. Repair the simulation clock and unintended energy-entry paths. Execute under the owner's review, fix and improve request.

The owner approved the CPU-first performance direction and instructed this work to completion. The performance increment executes the latest July 3 ADR amendment, grounded in the performance engineering research and performance reference. Its cohesive area is the frontend graph runtime and dev-only performance harness. On September 6, the owner also authorized the narrow project-picker regression repair required to clear the full frontend test gate; other unrelated frontend work remains excluded.

## Steps

- [x] `S01` - Correct force inertia, frame cadence and unintended host energy entry; verify regression and existing stability contracts; `frontend/src/scene/three`.
- [x] `S02` - Engineer and verify correctness-preserving graph simulation performance with pinned-region pruning, update reuse, overload scheduling and reproducible measurements; `frontend`.

## Parallelization

Within the performance step, force kernels, scene update reuse and scheduling have disjoint ownership and may run concurrently. The supervisor owns the dev-only benchmark, integration, records and final commit. Timing runs execute serially without competing test workloads.

## Verification

Prove active momentum balance without cooling, mixed-radius separation, pin locality, refresh-independent ticking, and bounded performance. Run existing scene tests and full frontend lint and test gates. Complete independent code review.

Separate pruning equivalence from arithmetic tolerance tests. Cover per-axis pins, shared coincidence RNG, cutoff/extreme coordinates, edge order/multiplicity, reset/freeze/release, update reuse and executed/discarded clock accounting. Require material local-drag improvement and reduced catch-up amplification without weakening physical invariants. Measure identical baseline/candidate kernels, naturally settled local drags, full callbacks, unchanged rebuilds and idle. Publish fixture/environment limits and any remaining over-budget individual ticks. The owner authorized driving this increment through completion without another routine approval pause.
