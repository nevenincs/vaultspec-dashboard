---
tags:
  - '#exec'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S01'
related:
  - "[[2026-06-13-constellation-live-delta-plan]]"
---

# Add a granularity tag to the diff entry so document deltas declare their species

## Scope

- `engine/crates/engine-graph/src/diff.rs`

## Description

- Add a `granularity: &'static str` field to the diff entry; the document
  differ sets it `document` at the single construction site.
- The wire entry shape becomes `{op, granularity, node?, edge?, t, seq}`.

## Outcome

Document deltas self-describe their species; the feature projection (S02) emits
the same wire shape tagged `feature`. A single-granularity consumer applies
only its own and ignores the other.

## Notes

The file is co-edited with the concurrent `edge_changed` content-diff hardening
(the peer's lane); the granularity field and that helper coexist.
