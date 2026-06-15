---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W02.P09` summary

Phase W02.P09 (rag semantic client) is complete: all three Steps closed,
workspace checks green at the boundary. This closes Wave W02 — all 22 Wave
W02 steps are done; 40 of 56 plan steps total. Wave W03 (CLI verbs, serve
mode, integration hardening) is the terminal wave.

- Created: `engine/crates/rag-client/src/client.rs`
- Created: `engine/crates/rag-client/src/discover.rs`
- Created: `engine/crates/rag-client/src/search.rs`
- Modified: `engine/crates/rag-client/src/lib.rs`,
  `engine/crates/rag-client/Cargo.toml`

## Description

Delivered the optional semantic tier. Service discovery reads rag's
service-json (port, bearer token); absence or unreadability is the
truthful unavailable state, never an error — everything else functions
without rag (D5.2). Transport is a minimal in-crate loopback HTTP/1.1
client behind a pluggable trait (a deliberate no-new-dependency call,
flagged in the S38 record), verified against an in-test TCP server
including bearer headers. Node-scoped discovery runs through the store's
semantic TTL cache (at-most-one live call per window, proven by
call-count), caps confidence at 0.7 with the raw score preserved in
provenance, and produces candidate edges whose ephemerality is
type-enforced — the test proves the graph boundary rejects them (D3.5).
Search forwarding transits rag's envelope verbatim with one addition:
per-result engine node-id annotation (null for sourceless hits), plus
degradation-reason mapping for the contract tier block.

Verification at the wave boundary: 96 workspace tests green, fmt and
clippy -D warnings clean. Review flags outstanding from this wave: P07's
strongest-rule-wins and as-of v1 bound, P09's no-HTTP-crate transport.
Carried gates into W03: W02P06-302/303 (scope-granular, pruning
re-ingestion when the watcher wires up), W02P05-203 (meta-edge
memoization), W01P04-104 (resolve memoization + gitignore, routed to P12).
