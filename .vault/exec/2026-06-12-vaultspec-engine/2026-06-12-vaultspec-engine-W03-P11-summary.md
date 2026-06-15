---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W03.P11` summary

Phase W03.P11 (serve mode) is complete: all six Steps closed, workspace
checks green at the boundary. 53 of 56 plan steps done; only P12
(integration hardening, 3 steps) remains.

- Created: `engine/crates/vaultspec-api/src/app.rs`
- Created: `engine/crates/vaultspec-api/src/routes/` (mod, query,
  temporal, stream, spa, ops)
- Rewritten: `engine/crates/vaultspec-api/src/lib.rs` (skeleton → the
  full contract router and serve lifecycle)

## Description

Delivered the single-origin resident front door per contract sections 1
and 3-8: loopback-only bind failing loud on port conflict, service-json
discovery with bearer token and 15-second heartbeat, ungated health and
bearer middleware elsewhere; the full query family (map, vault-tree,
graph/query with validated echoed filters and feature-granularity
meta-edges, filters vocabulary, node detail/neighbors/evidence/discover);
the temporal family (bucketed events, blob-true as-of with the
fidelity-stating tier block, ordered diff log on the single delta clock);
the multiplexed SSE stream with since= resume-or-gap over a bounded ring;
SPA serving with fallback routing, MIME map, and traversal guard; and the
transparent R1-whitelisted ops proxies plus the search pass-through with
node-id annotation.

Three audit gates CLOSED in this phase: W02P06-302/303 — the watcher
drives rebuild-at-scope-granularity with wholesale swap (never deltas into
a live graph), and the prescribed edit-that-removes-a-mention test proves
pruning convergence; W02P05-203 — constellation meta-edges memoize per
graph generation. One flag for review (S52 record): asset embedding
deferred to the D9.2 bundling mechanics; filesystem dist-dir serving is
the v1 shape. One recorded bound (S49): v1 serves the launch worktree
scope only, with per-request validation and honest 400s for other scopes.

Live-verified against this repository: service starts, indexes 109
nodes/690 edges at startup, /health ungated, bare /status 401s, bearer
/status reports the resident watcher and delta clock (seq 798 after
startup), and a feature-granularity graph query returns 4
engine-aggregated meta-edges. Verification at the boundary: 130 workspace
tests green, fmt and clippy -D warnings clean.
