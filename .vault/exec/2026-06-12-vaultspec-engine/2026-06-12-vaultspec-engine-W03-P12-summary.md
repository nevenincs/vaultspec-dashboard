---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
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

Post-queue additions (ruled by the phase review before closure, all
landed): DF-6 - the served `index.html` carries the service token as a
`vaultspec-token` meta tag (dist-dir and placeholder paths; assets
untouched), Host-header validation rejects foreign hosts on every request
including health (DNS-rebinding guard), and the 401-after-restart case is
tested (stale token from a previous process generation rejects - the
canonical reload signal). L1 - every HTTP route now travels in the
contract section 2 envelope ({data, tiers, next_cursor?}); the CLI keeps
its own ok/command/status vocabulary by ruling. L2 - one canonical
scope-token form everywhere (absolute worktree path, forward slashes, no
extended-length prefix) with the grammar documented in the map payload;
serve map gains corpus views for front-door parity.

DF-7 (dogfood, ruled): the DF-6 gating initially made the bootstrap
circular - the bearer gate covered the SPA shell, so a clean browser
could never load the page that delivers its token. The bearer boundary is
now the API prefix set exactly: static shell routes (root, assets, SPA
fallback) are ungated with loopback bind + Host validation as their trust
boundary; every API route stays bearer-gated. The acceptance flow is
tested AND live-verified: clean GET / renders the shell with the injected
token and the first authenticated API call succeeds (32-char token, 137
nodes, watcher resident); bare API requests still 401.
