---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W03.P12` summary

Phase W03.P12 (integration hardening) is complete: all three Steps closed.
This closes Wave W03 and the PLAN — all 56 Steps of the engine
implementation plan are done, pending the final phase review.

- Created: `engine/tests/` (the `engine-e2e` workspace member: e2e suite
  - cold-index benchmark)
- Created: `.github/workflows/engine-ci.yml`
- Modified: `justfile` (bench target, e2e riding the rust test target)
- Modified: `engine/crates/ingest-struct/src/resolve.rs` (104: memoized
  reads + bounded gitignore), `engine/crates/engine-graph/src/watch.rs` +
  `vaultspec-api` (watcher-death surfacing)

## Description

Delivered the hardening pass. The e2e suite exercises the plan's
verification clauses against a multi-worktree fixture landscape: the first
true multi-corpus-view facet exercise (one node, two views, divergence
surfaced exactly where the branch edit happened), CLI/serve parity with
byte-stable identity across repeated queries, the concurrency case that
retires DF-4 empirically (serve survives three concurrent one-shot index
runs), and the degradation paths. The REAL-repo leg ran live against this
repository — temporary branch + worktree, genuine vault divergence, both
corpus views reconciled, cleaned up, repo verified clean — proving the gix
integration against actual git plumbing per the lead's grounding mandate.
The cold-index benchmark records the baseline (200 docs / 1000 edges:
cold 2026ms, warm 1987ms, 100% cache hits; resolution dominates and is
deliberately uncached). CI wires fmt/clippy/build/test on ubuntu and
windows.

Carries closed: W01P04-104 (resolver memoization + bounded gitignore) and
the DF-4 residual (a dead watcher reports running:false with a reason in
/status — zombie services state themselves). Operator footgun recorded:
autocrlf rewrites make worktree facets diverge truthfully on every doc;
fixtures pin it off, real repositories should know.

Verification at the plan boundary: full workspace green — 140+ tests
including e2e and bench, fmt clean, clippy -D warnings clean, hooks pass.
