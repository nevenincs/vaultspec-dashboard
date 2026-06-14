---
tags:
  - '#audit'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-14'
related:
  - '[[2026-06-13-dashboard-optimization-plan]]'
  - '[[2026-06-13-dashboard-optimization-adr]]'
  - '[[2026-06-13-dashboard-optimization-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-optimization` audit: `campaign-verification`

## Scope

W04.P05.S10 (campaign verification gates). Audits the completed work of the
`dashboard-optimization` campaign: W01.P01.S01 (adverse harness),
W02.P02.S03 (bounded accumulator), W02.P02.S04 (debounce coalescing), and
W04.P05.S09 (engine performance sweep). Records gate results and deferred-step
status for the items carrying forward to future campaign drives.

## Gate Results

All gates run against committed state on 2026-06-14.

### Frontend

| Gate | Result |
|---|---|
| `npm run typecheck` | CLEAN — 0 errors |
| `npm run lint` (ESLint + Prettier) | CLEAN — 0 warnings, all files formatted |
| `npm run test` (Vitest) | 453 passed / 80 files / 0 failures |
| `npm run build` | GREEN — 425ms |
| Adversarial suite (`src/stores/__adversarial__/`) | 29/11 GREEN |
| Adverse harness (`src/testing/adverse.test.ts`) | 3/3 GREEN |

The build emits a chunk-size advisory (`index.js` 779 kB uncompressed, 232 kB
gzip); pre-existing condition for the Pixi + TanStack bundle, not a gate
failure.

### Engine

| Gate | Result |
|---|---|
| `cargo test` (full workspace) | 117 passed / 1 ignored / 0 failures |
| `cargo clippy -- -D warnings` | CLEAN — 0 warnings |
| `cargo fmt --check` | RED at audit close (drift from `eb6aa34`/`42b0e48`/`5b44ff6`/`23c958a`); cleared post-close by `1010abc` — W04 now fully green |

### Vault

| Gate | Result |
|---|---|
| `vaultspec-core vault check all` | 0 errors / 163 advisory warnings (pre-existing schema advisories) |

## Findings

### No HIGH findings across completed steps

**W01.P01.S01 — Adverse harness**
Delivered `src/testing/adverse.ts`: `syntheticGraphDeltas` (monotonic-seq
delta factory), `pushStorm` (mock SSE burst), `storm` (N-run driver),
`assertBounded` (growth-cap assertion that throws on violation). Three
self-tests green. Vitest-free by design so the harness imports anywhere. Immediately consumed by W02.P02.S03 and S04 as the "reproduce" step for each
fix. Fulfills ADR D3 (adverse-test methodology).

**W02.P02.S03 — Bounded stream accumulator**
`streamReducer` ring-capped at `STREAM_RETENTION = 256` chunks. Regression
test: 10,000 deltas through the reducer stays at 256 (the cap), latest seq
always retained so `maxSeq()` consumers are unaffected. Worst always-on
memory hazard closed: accumulator is bounded by construction. Per-append dedup
scan is now O(256), previously O(session-length). Fulfills ADR D2a.

**W02.P02.S04 — Debounce coalescing**
`debounce(fn, ms)` primitive added to `platform/timing.ts` with `cancel()` for
teardown; self-tested under a 200-call storm (collapses to one trailing call),
multi-burst, and cancel. `useGraphLiveSync` constellation invalidation debounced
150ms (scope-keyed); `NowStrip` status-recovery invalidation debounced 150ms.
Both `useMemo`'d on a stable dep and cancelled on unmount — no leaked timers.
A delta burst now costs one trailing refetch. Tests updated to be timer-aware.
Fulfills ADR D2b.

**W04.P05.S09 — Engine performance sweep (3 commits)**

`5b44ff6` — `harden(graph-api)`: The node ceiling previously applied only to
document granularity (`MAX_DOCUMENT_NODES`). A corpus with near-unique tags per
document could explode the feature constellation past the same ceiling, so
`bound_slice` now caps nodes and drops dangling document edges AND feature
meta-edges at BOTH granularities (`MAX_GRAPH_NODES = 5000`). Cache-invalidation
test added: mutating the graph after priming the cache must invalidate it on
the incremental re-index path. Meta-edge self-consistency test: a meta-edge to
a truncated feature node is dropped, not served dangling. Contract reference
§4 updated. The `graph-queries-are-bounded-by-default` rule now holds
unconditionally.

`5c76e45` — `perf(engine-query)`: `graph_query` cloned the entire match set
into `Vec<Node>` before handing each node to `node_view / feature_nodes` (which
only re-serialize). Switched to `Vec<&Node>` (sorting borrowed refs is cheap).
Measured at 4000 docs: feature granularity -31%, concurrent document -22%,
concurrent feature -46%. The allocation reduction matters most under adversarial
concurrent load. 26 engine-query tests green. Behavior-preserving.

`23c958a` — `test(ingest)`: The `O(N)` ingest pass reuses one `Resolver` across
all documents with symbol/step memoization. Added a regression test that a
memoized symbol resolves identically on the second document (a memo bug would
silently diverge later documents' resolution). Two documents, each citing the
same resolvable and the same broken symbol — both resolve consistently.

### LOW — W01.P01.S02 deferred (CI perf-gate)

The browser-level CI perf gate (`e2e/perf.spec.ts`, T-B1) was deferred in the
S01 record. The spike harness emitting `window.__SPIKE_RESULTS__` exists;
wiring it into CI and asserting the p95 budget (< 16.7ms on the 1000-node
corpus, ADR D1) was not part of this drive. Status: carried forward to
W01.P01.S02 in a future drive.

## Deferred Steps

Steps planned but not executed in this drive, all carried forward:

| Step | Description | Carries to |
|---|---|---|
| W01.P01.S02 | CI perf-gate spec (`e2e/perf.spec.ts`) | First item next drive |
| W02.P03.S05 | FA2 worker convergence detection (settle-and-stop) | Tasks #11 |
| W02.P03.S06 | Reversible scene mount bindings | Tasks #11 |
| W03.P04.S07 | Live no-refetch delta-apply (spliceLive, engine unblocked post-S50) | Tasks #9 |
| W03.P04.S08 | Dispatch confirm-guard consolidation | Tasks #12 |

No deferred step introduces a regression in its current unbuilt state. The
spliceLive path falls back to gap-triggered refetches (acknowledged in its
scope); the FA2 worker runs until stopped (pre-existing behavior, not worsened
by this campaign).

## Recommendations

- Close W01.P01.S02 (CI perf-gate) first in the next drive: the spike harness
  is ready, the budget is stated in ADR D1, and it gates all subsequent perf
  claims.
- Close W02.P03.S05 and S06 together in tasks #11 (scene perf wave) — FA2
  convergence and reversible bindings share the `fieldAssembly.ts` scope and
  the same `MutationObserver` lifecycle context.
- Close W03.P04.S07 (live delta-apply) before S08: it stresses the S03/S04
  bounded-accumulator and debounce fixes and proves the adverse harness's
  regression net end-to-end.

## Codification candidates

Two candidates noted during S03/S04 execution, deferred per the `vaultspec-codify`
rule's second-instance criterion (both are first-instance):

- **Candidate:** live accumulators are bounded by construction (ADR D2a / S03).
  First instance landed (`streamReducer` ring cap). Qualifies for codification
  when a second live accumulator ships with the same policy.
- **Candidate:** burst invalidations coalesce via shared trailing-edge debounce
  (ADR D2b / S04). First instance landed (`graphSync` + `NowStrip` debounce).
  Qualifies for codification when a second burst-path adopts the same policy.

No findings in this audit independently satisfy the three-criteria bar for
immediate codification. Both candidates are noted for the next drive author.
