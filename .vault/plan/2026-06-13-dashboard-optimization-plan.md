---
tags:
  - '#plan'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-13-dashboard-optimization-adr]]'
  - '[[2026-06-13-dashboard-optimization-research]]'
---








# `dashboard-optimization` plan

A standing campaign: feature completeness + performance optimization across TanStack, the GUI, and the backend, on an adverse-test foundation - reproduce, fix, verify, codify, in waves.

## Wave `W01` - Adverse-test infrastructure

Stand up the storm harness, bounded-growth assertion, and CI perf gate that reproduce and pin every later fix. Leads so each perf fix fails-then-passes an adverse test. Backs: ADR D3/D4 W01.

### Phase `W01.P01` - Adverse harnesses

The storm/bounded-growth test utilities and the CI perf gate.

- [x] `W01.P01.S01` - Add the fake-timer delta-storm harness and the bounded-growth assertion helper; `frontend/src/testing/adverse.ts`.
- [x] `W01.P01.S02` - Add the CI perf-gate spec that reads the spike frame-time results and asserts the p95 budget; `frontend/e2e/perf.spec.ts`.

## Wave `W02` - Performance optimization

Apply the four resource policies (bounded accumulation, coalesced invalidation, settle-and-stop, reversible lifecycle) to the ranked hotspots; depends on W01's harness. Backs: ADR D2/D4 W02.

### Phase `W02.P02` - Stores-side performance

Bound the live accumulator and coalesce the invalidation storms.

- [x] `W02.P02.S03` - Bound the streamed-query accumulator to a summary so it cannot grow session-unbounded; `frontend/src/stores/server/queries.ts`.
- [x] `W02.P02.S04` - Add a shared trailing-edge debounce and coalesce the graph and status invalidation storms; `frontend/src/stores/server/graphSync.ts`.

### Phase `W02.P03` - Scene-side performance

Settle the layout loop and make scene mount bindings reversible.

- [x] `W02.P03.S05` - Add convergence detection so the FA2 worker settles and stops, restarting on input; `frontend/src/scene/field/fa2.worker.ts`.
- [x] `W02.P03.S06` - Make the scene mount bindings reversible so they do not leak across remounts; `frontend/src/scene/field/fieldAssembly.ts`.

## Wave `W03` - Feature completeness

Finish the built-but-unwired surfaces now engine-unblocked (live delta-apply, feature asof, scrub e2e) and consolidate the dispatch confirm-guard. Backs: ADR D4 W03.

### Phase `W03.P04` - Live data plane and seams

Wire the now-unblocked live delta-apply and consolidate the dispatch confirm-guard.

- [x] `W03.P04.S07` - Wire the live no-refetch delta-apply and feature-granularity asof keyframe; `frontend/src/stores/server/graphSync.ts`.
- [x] `W03.P04.S08` - Consolidate the ops and palette arm-to-confirm onto the dispatch confirm-guard; `frontend/src/app/palette/CommandPalette.tsx`.

## Wave `W04` - Engine sweep and campaign verification

Engine-side performance sweep (sequenced last; heavy cargo builds) and the campaign verification audit. Backs: ADR D4 W04.

### Phase `W04.P05` - Verification

Engine perf sweep and the campaign verification audit.

- [x] `W04.P05.S09` - Run the engine-side performance sweep; `engine/crates/vaultspec-api/src`.
- [x] `W04.P05.S10` - Run the campaign verification gates and record the audit; `frontend/`.

## Description

This plan executes the `dashboard-optimization` ADR as a waved campaign. W01 stands up
the adverse-test infrastructure (storm harness, bounded-growth assertion, perf gate) that
reproduces every later fix; W02 applies the four resource policies to the ranked
performance hotspots; W03 finishes the now-engine-unblocked completeness surfaces and
consolidates the dispatch confirm-guard; W04 sweeps the engine and runs the campaign
verification. Each step follows the campaign cadence: reproduce (adverse test) -> fix ->
verify -> codify. The full backlog with evidence is in the `dashboard-optimization`
research; the budgets and policies are ADR D1-D3.

## Steps







## Parallelization

Waves are sequenced: W01 (harness) must land before W02 so each perf fix is reproduced
first; W02 before W03 because the unwired live delta-apply will stress the accumulators
and frame budget W02 hardens; W04 is last. Within W02 the two phases (stores-side P02,
scene-side P03) share no interdependency and may proceed in parallel. Within a phase,
each step pairs an adverse test (reproduce) with its fix.

## Verification

The campaign advances wave by wave; each wave's exit gate, and the plan's completion,
require all of:

- `cd frontend && npm run typecheck && npm run lint && npm run test` green (new adverse
  tests included and kept as regressions).
- `cd frontend && npm run build` green.
- The W01 perf gate (`e2e/perf.spec.ts`) holds the frame p95 budget; the bounded-growth
  and storm-coalescing adverse tests pass.
- `vaultspec-core vault check all` green.
- The concurrent conformance-hardening adversarial suite stays green.
- The `vaultspec-code-review` audit signs off each wave with no unresolved HIGH findings.

For tier-specific verification cadence, see the convention ADR
authorizing this plan via the `related:` frontmatter. -->
