---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W01.P04` summary

Phase W01.P04 (structural extraction) is complete: all four Steps closed,
workspace checks green at the boundary. This closes Wave W01 — all 18 Wave
W01 steps are done.

- Created: `engine/crates/ingest-struct/src/reader.rs`
- Created: `engine/crates/ingest-struct/src/extract.rs`
- Created: `engine/crates/ingest-struct/src/resolve.rs`
- Created: `engine/crates/ingest-struct/tests/pipeline_test.rs`
- Modified: `engine/crates/ingest-struct/src/lib.rs`
- Modified: `engine/crates/ingest-struct/Cargo.toml`

## Description

Delivered the structural tier's ingestion machinery per ADR section 3 v1
scope. Document bodies read from the working tree (content-hashed) and from
git blobs for ref-only scopes (blob-id identity, typed not-at-ref error) —
the same machinery the blob-true as-of path reuses in W02. The four
extractors run as one deterministic regex-free pass: wiki-link stems from
double-bracket spans, and paths, canonical step identifiers and code
symbols from inline backtick spans (fenced blocks opaque), every mention
carrying byte-span provenance. The resolver assigns resolved, stale or
broken per working-tree-verifiable v1 semantics — exact target, same-named
moved candidate or undecidable context, nothing — retaining broken mentions
as signal (D3.3); symbols match by qualified name with tree-sitter
explicitly deferred to v2.

Two precision calls recorded for phase review (S16, S17 records): backtick
spans as the extraction channel for non-wiki mentions (the vault's own
LINK RULES convention; bare prose tokens not extracted in v1), and stale
defined working-tree-verifiably rather than historically (history-aware
staleness needs the W02 cache).

Verification at the wave boundary: workspace `cargo test` fully green
(53 tests), `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean. Wave W01 is complete; W02 phases unblock.
