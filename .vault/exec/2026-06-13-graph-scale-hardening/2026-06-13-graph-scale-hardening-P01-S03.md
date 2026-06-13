---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S03'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Re-run scale_bench and record the cold-index before and after, keeping resolver tests green

## Scope

- `engine/tests/tests/scale_bench.rs`

## Description

- Re-ran the `scale_bench` cold-index measurement at 4000 and 8000 docs after
  each P01 step and recorded the before/after.
- Ran the full engine gate (`fmt --check`, `clippy --all-targets -D warnings`,
  `test --workspace`) to confirm no regression.

## Outcome

Cold index, docs → wall-clock:

- 4000 docs: 601s (original) → 6.3s (S01) → 2.1s (S02) — 286× faster.
- 8000 docs: ~O(N²) (~40 min projected) → 26.9s (S01) → 4.9s (S02).
- Scaling: 2× docs → 2.3× time (linear); the original ~58×-for-8×
  super-linearity is gone.

The document-granularity query/serialize numbers are unchanged (P01 is
ingest-only; bounding the query payload is P02/P03). The constellation LOD stays
feature-count-bounded. Full engine gate green; resolver behavior tests green.

## Notes

The benchmark is `#[ignore]` (explicit run via `--ignored`), so it does not tax
the normal suite. A residual sub-quadratic term remains from the first
all-code-files scan per distinct symbol; it is acceptable for cold rebuilds and
the resident watcher handles steady-state incrementally.
