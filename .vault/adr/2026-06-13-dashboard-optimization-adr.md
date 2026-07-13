---
tags:
  - '#adr'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-07-12'
related:
  - "[[2026-06-13-dashboard-optimization-research]]"
  - "[[2026-06-13-frontend-state-system-reference]]"
---

# `dashboard-optimization` adr: `performance and completeness campaign` | (**status:** `accepted`)

## Problem Statement

A standing campaign, not a single feature: drive feature completeness and performance
optimization across the TanStack/state layer, the GUI, and the underpinning backend, and
stand up the adverse-test infrastructure that keeps continuous feature expansion safe. An
evidence-cited review (the `dashboard-optimization` research) found the codebase ships
green over real resource hazards - a layout worker that never settles (always-on CPU), an
unbounded live-stream accumulator (session-long heap growth), un-debounced invalidation
storms, and leaked scene bindings - and several headline features built but unwired (the
no-refetch live delta animation, the unified confirm-guard). Zero perf/leak/frame tests
exist, so none of it is caught. This ADR commits the budgets, the resource policies, the
adverse-test methodology, and the wave plan so the campaign proceeds verifiably.

## Considerations

- The hazards concentrate where the layer-ownership rule predicts: the call/memory
  hotspots in `stores/server/` (the sole wire client), the frame hotspots in `scene/`.
- The adverse-test building blocks already exist (the crash injector, `mockEngine.push`/
  `degrade`, the dev-exposed `__platformRingBuffer`/`__liveStatusStore`, the `spike/`
  frame harness emitting p95/p99) - what is missing is connective tissue, not new
  infrastructure.
- The engine recently resolved S50 (ms timestamps + feature-granularity `asof`), which
  unblocks the built-but-unwired completeness items frontend-side.
- A sibling conformance-hardening campaign runs concurrently in this worktree; this
  campaign is the resource/completeness axis and must keep that campaign's adversarial
  suite green as it goes.

## Constraints

- **Reproduce before fix.** Each performance fix lands behind an adverse test that fails
  first (the campaign cadence); the adverse-test infra wave therefore leads.
- **No client workarounds for engine gaps.** Where a completeness item is engine-bound it
  stays flagged (`engine-read-and-infer`); the unblocked ones (post-S50) are fair game.
- **Layer ownership preserved.** Call/memory fixes stay in `stores/`; frame fixes in
  `scene/`; no fix crosses a boundary.
- **No new runtime dependency** for the optimization primitives (debounce, bounded
  accumulator) - small in-house utilities, consistent with the substrate's hygiene.
- **Behavior-preserving.** Optimizations must not change observable behavior except
  latency/throughput; existing tests stay green, new adverse tests pin the improvement.

## Implementation

The campaign is structured as waves; each wave's exit gate is its adverse tests green
plus the full suite, typecheck, lint, build, and `vault check all` green.

- **D1 - Performance budgets.** Frame p95 < 16.7ms on the 1000-node/5000-edge spike
  corpus (gated in CI by promoting the spike harness, T-B1). Live accumulators are
  bounded by construction (no session-unbounded growth). Burst invalidations coalesce to
  at most one refetch per debounce window (default ~150ms trailing).
- **D2 - Resource policies.** (a) *Bounded accumulation:* a live accumulator retains only
  what its consumers read - the stream reducer reduces to a `{lastSeq, count}` summary
  (or a ring-capped buffer), and the delta log compacts/re-keyframes rather than growing.
  (b) *Coalesced invalidation:* a shared trailing-edge debounce keyed on the last seq,
  with a narrowed query key. (c) *Settle-and-stop:* per-frame loops (the FA2 worker, RAF
  players) detect convergence/idle and stop, restarting on input. (d) *Reversible
  lifecycle:* mount bindings tear down on unmount even when the underlying singleton
  persists.
- **D3 - Adverse-test methodology (the infra wave, leads).** A fake-timer storm harness
  (`stormDeltas`), a bounded-growth assertion (`expectBounded`), a fault-injection
  wrapper over the mock, and a CI perf gate reading `window.__SPIKE_RESULTS__`. These are
  the "reproduce" step for every subsequent fix and the regression net for continuous
  expansion.
- **D4 - Wave plan.**
  - W01 Adverse-test infrastructure (T-B2 storm harness, T-B3 bounded-growth assertion,
    T-B1 perf gate, T-B4 fault wrapper).
  - W02 Performance fixes, each reproduced by W01: P-HIGH-6 (accumulator), P-HIGH-1/2
    (debounce), P-HIGH-8 (mount lifecycle), then P-HIGH-7 (FA2 settle) and the edge-mesh
    incrementalization.
  - W03 Completeness: C-A1 (live delta-apply, now unblocked) + C-A3 (feature asof) +
    C-A2 (un-fixme scrub); C-A4/A5 (confirm-guard consolidation); C-A9 (evidence panel).
  - W04 Engine-side performance sweep (sequenced last; cargo builds are heavy).
- **D5 - Continuous-expansion guard.** New feature surfaces inherit the budgets and the
  adverse harness: a new live accumulator must ship with a bounded-growth test, a new
  per-frame loop with a settle test, a new intent through the dispatch seam.

## Rationale

The wave ordering follows the campaign cadence (reproduce -> fix): D3's infra must exist
before D2's fixes so each is pinned by a failing-then-green adverse test, which is also
the regression net D5 needs for safe expansion. The budgets (D1) make "optimized" a
verifiable claim rather than a feeling. The resource policies (D2) are the four shapes
every hotspot in the research reduces to (bounded accumulation, coalesced invalidation,
settle-and-stop, reversible lifecycle), so fixing by policy prevents the next instance.
Completeness (W03) follows performance because the unwired live delta-apply will itself
stress the accumulators and frame budget the perf wave hardens.

## Consequences

- **Gains.** Always-on CPU/heap costs removed; request storms bounded; a frame budget and
  leak/growth nets that catch regressions in CI; the headline live-delta feature finished
  on a hardened base.
- **Honest difficulties.** The FA2 settle (P-HIGH-7) changes worker lifecycle and needs
  careful convergence tuning to avoid a frozen-layout regression; the mount-lifecycle fix
  (P-HIGH-8) touches the deliberately-singleton scene and must not double-mount. Promoting
  the spike to a CI perf gate risks flakiness on shared CI hardware - the gate uses p95
  with headroom, not a tight mean.
- **Pathways.** The storm/bounded-growth/perf-gate harness is reusable by every future
  feature; the bounded accumulator + debounce utilities become shared primitives.

## Codification candidates

Candidates (deferred per the cross-cycle bar; promote after a second instance):
`live-accumulators-are-bounded` (a session-long accumulator must retain only what its
consumers read, with a bounded-growth test), `burst-invalidations-coalesce` (stream-driven
cache invalidation debounces, never one-per-event), and `per-frame-loops-settle` (a
per-frame loop detects idle and stops). Recorded, not promoted.
