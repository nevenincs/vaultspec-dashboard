---
tags:
  - '#audit'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-rag-integration-hardening-plan]]'
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-07-03-rag-integration-hardening-research]]'
---

# `rag-integration-hardening` audit: `semantic search hardening review`

## Scope

Mandatory post-execution review of the fully executed plan (16/16 steps): the
`/search` move onto the resident rag HTTP service (P01), the search-plane freshness
contract (P02), the frontend timeout coherence and flat-shape adoption (P03), the
rag-gated live success tests (P04), the lifecycle ride-alongs (P05), plus the
RagOpsConsole Figma-parity rework and the `vectors.rs` comment fix. Two parallel
reviewer personas (engine, frontend) read the ADR, plan, research, and governing
rules, then audited every feature commit (`ae0254d310`..`bcf9721a8b`, excluding
interleaved scene/graph commits by other sessions) with the touched files read whole.
The full cross-language gate was run independently by the review: `just dev lint all`
exit 0 (eslint, prettier, tsc, px scan, token drift, figma:names, cargo fmt, clippy,
typos). Both live success tests were confirmed to have RUN LIVE against the resident
rag 0.2.28 rather than skipping.

**Verdict: PASS — no critical or high findings; forward work unblocked.** Two medium
and three low findings below; the mediums were remediated immediately after the
review (see each finding's closing note).

## Findings

### ragops-disclosure-ephemeral-usestate | medium | RagOpsConsole holds fold state in component-local useState, diverging from the rail's persisted disclosure store

`RagOpsConsoleBody` drove its STATUS/ADVANCED/JOBS folds from `useState`, while every
sibling right-rail section routes `FoldSection` disclosure through the shared view
store (`useStatusSectionOpen`/`toggleStatusSection`), so console disclosure reset on
every remount (rail-tab switch, panel close) and diverged from the rail idiom the
`FoldSection` primitive itself documents. Not a layer violation (disclosure is local
chrome); the defect is ephemeral state where the rail's persisted store is the
established home. REMEDIATED post-review: the three folds now use stable ids through
the shared disclosure store.

### d2-budget-mirror-drift | medium | The D2 client-outlives-engine budget invariant is guarded only against a hand-mirrored constant

`ENGINE_SEARCH_BUDGET_MS = 10_000` in `frontend/src/stores/server/queries.ts` is a
hand-copied mirror of the engine's `SEARCH_HTTP_BUDGET` (aliasing the shared
`rag_client::control::READ_BUDGET`). The guard test proves client > mirror, not
client > actual engine budget: a future `READ_BUDGET` change would leave the mirror
stale, keep the guard green, and silently reintroduce the timeout inversion ADR D2
exists to kill. Sound today (12s > 10s + 2s holds). REMEDIATED post-review with a
two-sided anchor: an engine guard test pins the search budget's numeric value and
names the frontend mirror; the frontend constant's comment names the engine anchor —
either side drifting alone now fails a test at the source of the change. Serving the
budget on the wire remains the stronger long-term option if the invariant ever needs
to be runtime-true rather than build-time-true.

### rag-jobs-count-list-incoherence | low | Jobs fold header count reads the recent-6 slice while the widened list shows up to 50

The fold header's count came from a separate `useRagJobs(scope, 6)` read while the
body could widen to 50 after "View all jobs", capping the badge at 6 as more cards
render. No double-poll existed (identical default keys dedupe; the jobs list read is
non-polling). REMEDIATED post-review: the widen state was lifted so the header count
and the body render from the same query.

### live-test-vacuous-hit-annotation | low | The engine live test drives an unindexed scope, so hit-level annotation drift is not exercised live

`engine/crates/vaultspec-api/tests/rag_live_search.rs` drives the fixture cell's own
unindexed root, so the honest live outcome is an empty `results` array and the
per-hit `node_id` assertion is vacuously satisfied. The test is a real
envelope-shape drift detector (top-level `results`/`index_state`/`semantic_epoch`),
but per-hit vocabulary drift (a rag rename of `source`/`path`) would pass CI and
surface as null ids on users; hit-level coverage rests on the recorded rag 0.2.28
fixture. Conscious ADR D4 limit ("assert the served contract shape, never a specific
hit"), recorded as a hardening opportunity: opportunistically drive an
already-indexed root when discovery finds one.

### install-double-run-text-branch | low | The version-tolerant retry's text-scan branch could re-run a side-effecting verb in one contrived future case

The primary `--json`-rejection branch (typer exit-2, raised during option parsing
before the command body runs) is safe for all verbs including `server-install`. The
belt-and-suspenders branch (exit-1 plus combined output containing both "no such
option" and "--json") could in principle retry an install whose body already ran, if
a future rag emitted that exact text while exiting 1. Doubly-scoped text match,
normally-idempotent verb, unit-pinned retry decisions — recorded, not actioned.

### verified-sound | info | The load-bearing invariants both reviewers confirmed

Engine: transport bounds (socket timeout AND 16 MiB body cap on every search read);
no blocking I/O on async workers (search, reprobe loop, epoch read all offloaded);
`SemanticEpochCache` poison-recovering, TTL-bounded, single-slot, never fabricating
an epoch (failed read → honest null on the search plane); read-and-infer verbatim
forwarding (only `node_id` and `semantic_epoch` added; `request_id`/`summary`/
`timing`/`index_state` byte-equal); tiers on every path (bounds-400s, degraded 200s,
success) from typed discovery, never guessed; deleted CLI path grep-clean (no
`SEARCH_SIBLING_TIMEOUT`/`forward_search`/`target_node_id`); `project_root` is the
engine-controlled serde-escaped body field (no caller override, no encoding gap);
bearer token never logged (degradation reasons format status codes only);
over-ceiling `max_results` rejected as tiers-400, never silently clamped; the renamed
tier-parity test still guards the LENSA-02 declared-tier invariant deterministically;
no wire mocks anywhere (FakeTransport mocks the crate's own trait seam; the epoch
cold-window has no single-flight but is bounded, idempotent, and search never
triggers it). Frontend: the flat-shape cutover is bridge-free (nested envelope path
and mock short-circuit deleted, single call site); freshness carried as three
distinct truths (number/null/absent) with `index_state` forwarded verbatim and
omitted when empty; no selector-discipline hazard (raw reference forwarding;
`interpretSearch` is hook render output, not a store snapshot); `max_results`
correctly out of the query key and guard-pinned to the merged-view bound; the merged
`UnifiedSearchView` deliberately carries only the shared epoch (per-corpus
`index_state` stays on the single-target controllers — merging would be lossy, so
this is honest, not a gap); the console defers to the kit Button primitive
(`className` is type-impossible), the lifecycle grid holds equal widths in every
pending permutation, and the S12 live test gates on served tiers truth with
`ctx.skip` and a stated reason.

### danger-button-figma-kit-divergence | info | The kit Button danger variant (outlined red) diverges from the Figma console instance (filled red) — reconcile at the primitive, not the console

The console correctly consumes the centralized `Button` danger variant; the
divergence is between the kit component and the design instance in `879:4125`.
Per the design-system rule the reconciliation belongs at the kit Button's binding to
the Figma component kit (update the primitive everywhere, or correct the Figma
instance) — never an ad-hoc filled-red in one surface. Routed as a follow-on design
decision outside this feature.

### process-notes | info | Execution deviations recorded

P05 landed S13/S14/S16 as one commit rather than one per step (traceability
preserved through the three step records). The rag-console-review feature needed a
minimal audit-driven ADR stub to satisfy the exec-record CLI gate. The engine debug
binary could not be rebuilt during P04.S12 because a pre-existing dev serve held the
lock; a read-only probe confirmed the running binary already served the new fields.

## Recommendations

- Fast-follows already applied under this audit: the disclosure-store move, the
  two-sided budget anchor, and the jobs count coherence (see the medium/low findings'
  closing notes and the remediation commit).
- Follow-ons to schedule, not blockers: opportunistic indexed-root live coverage for
  hit-level annotation drift; the kit-Button-vs-Figma danger reconciliation; consider
  serving the engine search budget on the wire if the D2 invariant should become
  runtime-verifiable; the epoch cache may gain single-flight if the embeddings plane
  ever fans out.
- The rag coordination reference (aggregate storage totals + collection-name
  descriptor on the rag side) remains the standing external ask; its landing retires
  the blake2b exception per the sunset clause.

## Codification candidates

- The ADR's `search-rides-the-resident-service` rule candidate stands as written
  (one transport, epoch-annotated responses, client budget strictly above engine
  budget); promote after this cycle holds.
