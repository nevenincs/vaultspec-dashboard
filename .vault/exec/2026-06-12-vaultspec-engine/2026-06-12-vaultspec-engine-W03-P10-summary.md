---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W03.P10` summary

Phase W03.P10 (CLI verbs) is complete: all seven Steps closed, workspace
checks green at the boundary. 47 of 56 plan steps done; P11 (serve mode)
and P12 (integration hardening) remain.

- Created: `engine/crates/vaultspec-cli/src/envelope.rs`
- Created: `engine/crates/vaultspec-cli/src/cmd/` (mod, map, index, graph,
  node, events, status)
- Rewritten: `engine/crates/vaultspec-cli/src/main.rs` (stub verbs →
  real implementations)
- Modified: `engine/crates/engine-graph/src/index.rs`
  (`index_worktree_full` force path), `vaultspec-cli/Cargo.toml`

## Description

Delivered the one-shot CLI front door: six verbs as thin shells over the
shared query core (D6.1), with per-request scope resolution (the launch
directory only as the advertised fallback), the shared `--json` envelope
in core's result vocabulary plus the contract section 2 tier block (D6.2),
typed failure envelopes at exit 1, and scope errors at exit 2. Map serves
the landscape with advisory classification and degraded-tier flags on
remote refs; index runs the incremental pipeline with a `--full` force
path that converges per D8.2; graph exports tier-labelled node-link JSON
with the validated filter echoed and `--as-of` via blob-true
reconstruction; node serves detail, full context with evidence (including
the resolved-target bridge), and tier narrowing; events serves
contract-shaped commit events with raw/auto/fixed bucketing; status rolls
up index, backend, and watcher state truthfully.

Every verb was live-verified against this repository's own corpus: 101
documents indexed (100% cache hits warm), 649 structural edges, 74 broken
edges surfaced by the broken lens, 162 structural edges on the engine
plan's degree projection. Windows extended-length path prefixes are
normalized at the wire. Verification at the boundary: 119 workspace
tests green, fmt and clippy -D warnings clean.
