---
tags:
  - '#plan'
  - '#graph-worktree-edge-consistency'
date: '2026-06-30'
modified: '2026-06-30'
tier: L2
related:
  - '[[2026-06-30-graph-worktree-edge-consistency-adr]]'
  - '[[2026-06-30-graph-worktree-edge-consistency-research]]'
---

# `graph-worktree-edge-consistency` plan

### Phase `P01` - Engine ingest: present-view declared edges read the working tree

Switch the live (present-view) declared-edge ingest from committed HEAD to the working tree, leaving the as-of/historical ref path untouched, so a node and its related edges come from one snapshot.

- [x] `P01.S01` - Switch the present-view declared-edge ingest in index_documents from the HEAD ref to the working tree (ref None), keeping ingest_core_graph's git_ref parameter so as-of and historical callers stay on their explicit sha, and rewriting the load-bearing comment to record the now-verified core 0.1.36 document-read-only working-tree premise; `engine/crates/engine-graph/src/index.rs`.
- [x] `P01.S02` - Add a unit test over a temp git fixture asserting the synchronous index_worktree ingests declared related edges for a doc present in the working tree but absent from HEAD (uncommitted/untracked); `engine/crates/engine-graph/src/index.rs`.
- [x] `P01.S03` - Audit and update any conformance/e2e expectation that assumed declared edges are HEAD-only, so the present-view-reads-working-tree behavior is asserted not contradicted; `engine/tests/tests/conformance.rs`.

### Phase `P02` - Declared-fold cache re-key

Move the API declared-fold cache off the HEAD-sha key (invariant under uncommitted edits) onto a working-tree corpus fingerprint, so a .vault edit refreshes edges together with nodes.

- [x] `P02.S04` - Re-key the declared-fold cache off HEAD-sha onto a working-tree corpus fingerprint (or invalidate per structural rebuild) and switch the fold's fetch_core_graph_json calls from Some("HEAD") to working-tree, updating declared_cache_key and declared_fold_blocking; `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `P02.S05` - Align read_declared_artifact and the rebuild_and_swap declared sync-fallback / carry-last-good path to the new working-tree source and content key, so node and edge refresh stay coupled per rebuild and no stale HEAD-keyed artifact is served; `engine/crates/vaultspec-api/src/app.rs`.

### Phase `P03` - Tests and live verification

Prove the uncommitted cross-reference cluster now serves its edges, that an uncommitted related edit refreshes edges without a commit, and that as-of/historical views are unchanged.

- [x] `P03.S06` - Add an integration test asserting an uncommitted related: edit refreshes the served declared edges on the next rebuild without a commit (the HEAD-sha cache-key trap regression guard); `engine/tests/tests/e2e.rs`.
- [x] `P03.S07` - Add a test asserting historical/as-of graph (an explicit committed sha) is unchanged by the present-view switch (blob-true reconstruction still HEAD/committed); `engine/tests/tests/e2e.rs`.
- [x] `P03.S08` - Live-verify against the running engine that the previously edge-less uncommitted agentic-ADR cluster now serves its related edges at document granularity, and record the before/after edge counts; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P04` - Rebuild-latency measurement

Measure the rebuild-latency impact of running working-tree vault graph per structural rebuild and confirm core's fingerprint cache keeps a no-change call cheap.

- [x] `P04.S09` - Measure the rebuild-latency impact of running working-tree vault graph per structural rebuild versus the prior HEAD-sha cache, confirm core's fingerprint cache keeps a no-change call cheap, record the numbers, and tighten the cache strategy only if regressed; `engine/tests/tests/bench.rs`.

## Description

This plan fixes the present-view graph inconsistency in which uncommitted `.vault/`
documents render as disconnected, edge-less nodes. The accepted decision (Option A)
sources the live graph's declared cross-reference edges from the **working tree**
instead of committed HEAD, so a node and its `related:` edges come from one corpus
snapshot, while historical and as-of views remain on their explicit committed sha.
The fix has two coupled halves: switch the present-view declared-edge ingest to the
working tree (the engine ingest), and re-key the API declared-fold cache off the
HEAD-sha (which is invariant under uncommitted edits and would otherwise re-serve stale
edges) onto a working-tree corpus fingerprint, so a `.vault/` edit refreshes nodes and
edges together. The change rests on the research finding that core `0.1.36` working-tree
`vault graph` is document-read-only (no `modified:` stamping, no `.gitignore` rewrite),
so reading it honours the read-and-infer boundary; the only side effect is a gitignored,
re-derivable `.graph-cache` write accepted as in-contract. Edge stable ids are composed
from endpoints, relation kind, and tier - never the corpus snapshot - so working-tree
and later HEAD-read edges share one id and no SSE delta-clock churn occurs across a
commit. The blast radius is the engine ingest and its API declared cache only: no wire
shape, no frontend, and no contract change. Authorizing documents are linked in the
plan's `related:` frontmatter.

## Steps

## Parallelization

The phases carry a hard ordering. `P01` (ingest reads the working tree) and `P02`
(cache re-key) are the two halves of the same defect and must both land before the
behaviour is correct; `P02` depends on `P01`'s working-tree fetch path, so author
`P01` first, then `P02`. Within `P01`, the code change `P01.S01` precedes its tests
`P01.S02`/`P01.S03`. `P03` (tests and live verification) requires both `P01` and `P02`
complete - its uncommitted-edit-refresh guard (`P03.S06`) specifically exercises the
`P02` cache re-key, and the live verification (`P03.S08`) needs the full fix running.
`P04` (rebuild-latency measurement) runs last, after the working-tree-per-rebuild path
is in place; if it finds a regression it feeds back into the `P02` cache strategy.
No two phases are safely parallel; steps within a phase follow code-before-test order.

## Verification

The plan is complete when every Step is closed and all of the following hold:

- The live engine, queried for the previously edge-less uncommitted cross-reference
  cluster at document granularity, serves its `related` edges (before: 18 nodes / 0
  edges among them; after: the cluster's full edge set), with the before/after counts
  recorded (`P03.S08`).
- An uncommitted `related:` edit refreshes the served declared edges on the next
  rebuild **without a commit** - the cache-key-trap regression guard test passes
  (`P03.S06`).
- Historical / as-of graph for an explicit committed sha is byte-unchanged by the
  switch - the as-of-unchanged test passes (`P03.S07`).
- A document present in the working tree but absent from HEAD (uncommitted/untracked)
  ingests its declared `related` edges - the engine unit test passes (`P01.S02`), and
  no conformance/e2e expectation still asserts HEAD-only declared edges (`P01.S03`).
- The read-and-infer boundary holds: no `.vault/` document is mutated by a graph read
  (the gitignored `.graph-cache` write is the only filesystem effect and is accepted).
- Rebuild latency under the per-rebuild working-tree `vault graph` path is measured and
  shows no material regression versus the prior HEAD-sha cache (`P04.S09`).
- The full lint gate is green per the declaring-green discipline: `just dev lint all`
  (or the engine equivalent `cargo fmt --check` + `cargo clippy`) exits 0 and
  `cargo test --workspace` passes; the code reviewer signs off in a
  `vaultspec-code-review` audit.
