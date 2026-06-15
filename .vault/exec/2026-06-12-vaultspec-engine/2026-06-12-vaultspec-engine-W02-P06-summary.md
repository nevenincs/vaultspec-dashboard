---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W02.P06` summary

Phase W02.P06 (index pipeline and watcher) is complete: all five Steps
closed, workspace checks green at the boundary.

- Created: `engine/crates/engine-graph/src/index.rs`
- Created: `engine/crates/engine-graph/src/watch.rs`
- Created: `engine/crates/engine-graph/tests/rederive_test.rs`
- Created: `engine/crates/engine-store/src/events.rs`
- Modified: `engine/crates/engine-store/src/lib.rs` (CorruptEventRow,
  strict node_ids decoding)
- Modified: `engine/crates/ingest-struct/src/extract.rs` (serde on
  mention types, enabling the extraction cache)
- Modified: `engine/crates/engine-graph/src/lib.rs`

## Description

Delivered the index pipeline and its serve-mode driver. Cold full-index
runs the whole chain — vault enumeration, parallel per-document read
fan-out on rayon, frontmatter feature tags, per-scope facets, extraction,
live resolution, band-enforced structural edge ingestion — with no
resident service required (cold start is a feature, D2.4). Incremental
re-index skips extraction for unchanged blobs via (kind, blob-oid) cache
artifacts while always recomputing resolution against the current tree;
`IndexStats` makes skip behavior observable. The debounced notify-8
watcher coalesces filesystem events into deduplicated dirty-path batches
over a worktree's vault and git roots. Event-log persistence lands the
contract section 5 raw shape with path→node-id correlation, and review
carry W01P01-002 is closed: corrupt `node_ids` rows raise a typed loud
error on every read path. The re-derivability test proves ADR D8.2
mechanically: cold index, warm 100%-cache-hit re-index, cache deletion,
and re-index converge to byte-equal canonical snapshots with stable ids
throughout.

Verification at the boundary: 73 workspace tests green, fmt and clippy
-D warnings clean. Review carry W01P04-104 (memoized resolve reads,
gitignore honoring) remains open and re-flagged rather than silently
grown. Next: W02.P07 (temporal correlation and time-travel).
