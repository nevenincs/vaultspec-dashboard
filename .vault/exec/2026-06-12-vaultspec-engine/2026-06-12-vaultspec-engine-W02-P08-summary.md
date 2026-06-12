---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W02.P08` summary

Phase W02.P08 (query core) is complete: all four Steps closed, workspace
checks green at the boundary. W02.P09 (rag client) is the last W02 phase.

- Created: `engine/crates/engine-query/src/filter.rs`
- Created: `engine/crates/engine-query/src/graph.rs`
- Created: `engine/crates/engine-query/src/node.rs`
- Created: `engine/crates/engine-query/src/envelope.rs`
- Modified: `engine/crates/engine-query/src/lib.rs`

## Description

Delivered the single shared query core (D6.1) both front doors will shell
over. The engine-owned filter object validates loud (deny-unknown-fields,
typed errors for unknown tiers/states and out-of-range confidence floats
per contract R3) and echoes back normalized; the vocabulary is
server-enumerated from the live graph. The scoped graph query applies the
stateless per-request scope and granularity: document level returns doc
edges, feature level returns engine-aggregated meta-edges only. Node
queries serve detail (context bundle), lazy ego neighbors with depth and
tier filters, and evidence separating documents, code locations with live
resolution state, and rule-attributed commits. The envelope layer carries
cursor pagination (no-gaps-no-overlap walk tested) and the always-present
per-tier degradation block.

Audit threads honored in code: the W02P05-201 ruling lives in the filter
predicate (an explicit broken lens is never hidden by a confidence floor —
tested), and the W02P06-301 identity decision is recorded in the S36
record as the consuming step. Verification at the boundary: 105 workspace
tests green, fmt and clippy -D warnings clean.
