---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W01.P01` summary

Phase W01.P01 (model and store foundations) is complete: all five Steps
closed, workspace checks green at the boundary.

- Modified: `engine/crates/engine-model/src/lib.rs`
- Created: `engine/crates/engine-model/src/id.rs`
- Modified: `engine/crates/engine-store/src/lib.rs`
- Modified: `engine/crates/engine-store/Cargo.toml`

## Description

Delivered the two foundations every later phase consumes. The
`engine-model` crate now carries the full ADR section 3 vocabulary as pure
no-IO serde types plus stable identity derivation per contract section 2:
`CanonicalKey` covers all five node key forms, and `edge_id` content-hashes
src, dst, relation, tier and the provenance *stable key* (volatile
ingestion inputs deliberately excluded so re-derivation preserves ids) over
an in-crate deterministic FNV-1a 128. The `engine-store` crate implements
the rusqlite derived-artifact cache at the D8.1 location: schema v1
(content-hash-keyed artifacts, monotonic temporal event log, semantic TTL
cache) versioned via `user_version` with loud failure on unknown versions,
WAL journaling, and a single-writer / concurrent-reader API enforced by
connection flags and the type system rather than convention.

Verification at the phase boundary: `cargo build`, `cargo test` (19 suites,
all green; 14 unit tests across the two touched crates), `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` all pass in
`engine/`. One design call flagged for the phase review (S03 record): the
edge-id hash uses the provenance stable key rather than full provenance,
read as the contract's re-derivation clause intent.
