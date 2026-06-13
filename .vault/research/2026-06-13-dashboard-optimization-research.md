---
tags:
  - '#research'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-frontend-state-system-reference]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace dashboard-optimization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-optimization` research: `performance and completeness campaign`

This grounds a standing campaign: feature completeness plus performance optimization
across the TanStack/state layer (`frontend/src/stores/`), the GUI (`frontend/src/app/`,
`frontend/src/scene/`), and the underpinning backend, with the adverse-test
infrastructure to keep continuous feature expansion safe. Distinct from the conformance
hardening campaign (that targets contract correctness; this targets resource resilience -
excessive calls, memory growth, refresh-rate stability - and finishing the
built-but-unwired feature surfaces). Two evidence-cited analyses (a performance hotspot
sweep and a completeness + adverse-test-infra sweep) produced the backlog below; the
sibling ADR commits the budgets, policies, and wave plan.

## Findings

### F1 - Performance hotspots (ranked; the perf backlog)

Confirmed against the tree (`file:line` in the source analyses). Zero perf/leak/frame
tests exist today, so every item ships green.

- **P-HIGH-7 - the FA2 layout worker never settles.** `fa2.worker.ts` re-arms a 16ms
  `setTimeout` tick forever while running; `FieldLayout.start()` is called on every
  reseed but `stop()` is never called from production. The worker runs FA2 and
  `postPositions()` every 16ms indefinitely, allocating fresh `Float32Array`/`Map` per
  tick on both threads, driving sprite/edge/hit-tester/anchor work 60x/sec even on an
  idle static field. Highest always-on cost. Fix: convergence detection + `stop()`.
- **P-HIGH-6 - the streamed-query accumulator grows unbounded.** `streamReducer`
  (`stores/server/queries.ts`) returns `[...acc, chunk]` with `staleTime: Infinity` on a
  never-closing live stream: the `StreamChunk[]` grows once per delta for the whole
  session (O(n^2) with the re-spread) and `maxSeq` rescans it. Only `lastSeq`/`length`
  are read downstream. Fix: reduce to a bounded summary (`{lastSeq, count}`) or ring-cap.
- **P-HIGH-1 / P-HIGH-2 - un-debounced invalidation storms.** `graphSync.useGraphLiveSync`
  invalidates the constellation on every delta (`exact:false`, broad), and
  `NowStrip` invalidates `/status` on every backends/git event. A delta/event burst -> a
  refetch storm with multiplicative fan-out. Fix: one shared trailing-edge debounce
  keyed on the last seq; narrow the invalidation key.
- **P-HIGH-8 - the scene mount bindings leak across remounts.** The global scene singleton
  is "destroyed never"; the Stage mount effect never calls `scene.controller.destroy()`,
  so `onReady`/ticker/pointer/observer bindings accumulate per remount. Fix: a reversible
  `field.unmount()` that runs the detach list without destroying the Application.
- **P-MED - edge-mesh full rebuild on delta-apply and per fade frame** (`fieldAssembly`/
  `edgeMeshes`), **SSE reconnect with no backoff** (`engineStreamOptions` `retry:true`),
  **Stage subscribes the whole filter store** + un-debounced text filter, **working-set
  ego fan-out uncapped**, **`gcTime` unset**.

### F2 - Completeness gaps (ranked; the completeness backlog)

- **C-A1 - live no-refetch delta-apply is built but unwired.** `TimeTravelDriver.spliceLive`,
  `DeltaLog`, `applyDelta`, and the field's `apply-deltas` are all implemented and tested,
  but `useGraphLiveSync` does invalidate-and-refetch instead. The engine now accepts ms
  timestamps + feature-granularity `asof` (S50 resolved), so this is frontend-buildable:
  feed `spliceLive`, emit `since=lastSeq`.
- **C-A3 - feature-granularity asof keyframe stubbed.** `graphAsof` is pinned to the
  document path (S50 note); now unblockable - add `granularity`, route through the
  meta-edge fold.
- **C-A2 - the scrub e2e is `test.fixme`** on the now-resolved asof/diff timestamp
  blocker - un-fixme + verify.
- **C-A4 / C-A5 - the dispatch confirm-guard middleware has zero production consumers.**
  Both OpsPanel and CommandPalette hand-roll arm-to-confirm; palette also bypasses
  `dispatchOps` entirely (GUI finding 032). Consolidate both onto `useConfirmable`.
- **C-A9 - evidence panel unbuilt** (`nodeEvidence` typed + hook'd, no UI consumer).

### F3 - Adverse-test infrastructure (the substrate "adverse code testing" needs)

Building blocks exist (crash injector, `mockEngine.push`/`degrade`, dev-exposed
`__platformRingBuffer`/`__liveStatusStore`, the `spike/` frame-time harness emitting
p95/p99). Missing connective tissue, all frontend-buildable now:

- **T-B1 - a perf gate.** `spike/main.ts` emits `window.__SPIKE_RESULTS__` but nothing
  reads it; add a Playwright spec asserting `p95Ms < budget`.
- **T-B2 - a fake-timer storm harness.** No test advances virtual time; a
  `stormDeltas(mock, n)` helper over `mockEngine.push` + `vi.useFakeTimers` reproduces
  the call/memory storms before fixing them.
- **T-B3 - a bounded-growth assertion** (`expectBounded`) for the accumulators
  (delta log, stream reducer) - the memory regression guard.
- **T-B4/B5/B6 - fault-injection wrapper, soak probe, reconnect/replay coverage.**

### F4 - Campaign shape

Cadence (shared with the hardening campaign): review -> reproduce (adverse test) -> fix
-> verify (test kept as a regression) -> codify, in waves, user kept informed at phase
boundaries. The adverse-test infra (T-B*) leads so each perf fix is reproduced before it
is fixed. Engine-side performance is a later sweep (cargo builds are heavy; sequence
after the frontend wave, per the hardening-campaign cadence).

### Open questions routed to the ADR

1. The performance budgets (frame p95 target; max accumulator sizes; debounce windows).
2. The bounded-growth policy (cap-and-summarize vs ring-buffer per accumulator).
3. The wave ordering and what each wave's exit gate is.
