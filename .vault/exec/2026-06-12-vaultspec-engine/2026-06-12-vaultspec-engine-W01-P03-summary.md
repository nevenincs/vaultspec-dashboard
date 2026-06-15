---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W01.P03` summary

Phase W01.P03 (core declared-graph adapter) is complete: all four Steps
closed, workspace checks green at the boundary.

- Created: `engine/crates/ingest-core/src/runner.rs`
- Created: `engine/crates/ingest-core/src/graph_v2.rs`
- Created: `engine/crates/ingest-core/src/inventory.rs`
- Created: `engine/crates/ingest-core/tests/fixtures_test.rs`
- Created: `engine/crates/ingest-core/tests/fixtures/` (four live payloads)
- Modified: `engine/crates/ingest-core/src/lib.rs`
- Modified: `engine/crates/engine-model/src/id.rs` (public `content_hash`)

## Description

Delivered the vaultspec-core boundary per ADR D5.1: a subprocess runner
invoking core verbs with `--json` inside the scope's checkout, a versioned
envelope with schema pinning that fails loud (naming both the found and the
supported schemas) on anything unknown, the graph v2 parser producing
declared-tier edges at confidence 1.0 with core's authored kind,
multiplicity and weight preserved verbatim, core's `derived_edges` ingested
as the distinct core-derived relation at 0.8 (never mixed into declared),
and typed adapters for the three inventory envelopes. Edge identity is
provenance-stable: the provenance key is per logical edge, so a changed
payload re-derives identical edge ids (contract section 2), proven by test.

Fixtures are live payloads recorded from vaultspec-core 0.1.28 against this
repository's own vault (26 documents, 54 declared, 203 derived); five
integration tests drive the full pinned-envelope-to-parsed-graph path
against them, including edge-id uniqueness and reparse determinism.

Verification at the boundary: workspace `cargo test` fully green (16 new
tests in the crate plus fixtures), `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` clean. One note carried to W02.P05 (S12
record): the ADR's preserved kind/multiplicity/weight live on the
`DeclaredEdge` wrapper; their storage shape in the in-memory graph is that
phase's decision. No ADR deviations.
