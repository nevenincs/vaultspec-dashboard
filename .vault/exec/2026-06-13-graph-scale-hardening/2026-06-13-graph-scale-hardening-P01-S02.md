---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Build inverted indices once and resolve each mention by lookup

## Scope

- `engine/crates/ingest-struct/src/resolve.rs`

## Description

- Built a `by_basename` inverted index (basename → first path in sorted order)
  once at `Resolver::new`, replacing the O(N) `find_by_basename` linear scan with
  an O(1) lookup; the sorted-first semantics are preserved exactly.
- Added `symbol_memo` and `step_memo`: symbol and step-id resolution are pure
  functions of the key against the fixed tree, so repeated mentions across
  documents collapse to one all-files scan per DISTINCT symbol / step id rather
  than one per mention.

## Outcome

Cold index is now linear. At 4000 docs: 6.3s → 2.1s. At 8000 docs: 26.9s → 4.9s
— 2× the docs takes 2.3× the time (was 4.3× after S01, ~58× originally). That is
**286× faster than the original at 4000 docs** (601s → 2.1s). The resolver test
stays green; the memo is a pure-function cache, byte-identical in result.

## Notes

Symbol resolution remains v1 substring-match (a qualified-name `text.contains`);
tree-sitter-grade token resolution is explicitly v2 per the engine ADR, so the
memo deliberately does not change the matching semantics — it only avoids
recomputation. A slight residual ~O(N^1.2) remains from the first scan per
distinct symbol against a growing code-file set; it is well within linear-enough
for cold rebuilds, and the resident watcher indexes incrementally in steady
state.
