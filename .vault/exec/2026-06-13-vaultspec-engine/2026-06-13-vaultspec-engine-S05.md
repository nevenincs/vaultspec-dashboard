---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-12'
step_id: 'S05'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---




# Bound commit-event node-ids: filter to graph-known nodes and cap with a truncation count, and record the bound in the contract reference

## Scope

- `engine/crates/engine-query/src/events.rs`

## Description

- Add `CODE_NODE_IDS_CAP = 20`; partition correlated ids into doc/commit (always
  kept - they are the timeline's join key) and code (bounded).
- Thread an optional `known: &LinkageGraph` into `commit_rows`; when present,
  filter code ids to graph-known nodes, cap survivors at the bound, and report
  the dropped count in a new `truncated_node_ids` field on the row/event.
- Pass the indexed graph at both front doors (serve `/events`, CLI events verb);
  without a vault the bound is inapplicable and the cap alone applies.
- Record the bound in the contract reference section 5.

## Outcome

Commit-event code ids are bounded (at most 20, graph-known) with a non-silent
truncation count; doc and commit ids are never truncated. Conformance
divergence 5 is green, and the contract section 5 carries the recorded bound
(ADD-901/S05).

## Notes

Persisted event rows are written already-bounded, so the SQLite range read
reports `truncated_node_ids: 0`; the field is skipped on the wire when zero.

