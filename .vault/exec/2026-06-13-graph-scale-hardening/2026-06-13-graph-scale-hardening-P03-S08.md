---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S08'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Amend the contract reference and add conformance assertions for the bounded-query semantics

## Scope

- `engine/tests/tests/conformance.rs`

## Description

- Amended the contract reference §4 with the bounded-query semantics (ADR D2):
  constellation LOD is the unbounded-safe default view; document granularity is
  hard-capped at `MAX_DOCUMENT_NODES` with a self-consistent truncated subgraph
  and an honest `truncated` block; bounded descent is the feature-tag filter;
  spatial viewport is client-side.
- Asserted the ceiling behavior with unit tests in `query.rs` (`bound_tests`):
  under-ceiling untouched; over-ceiling truncates to the ceiling and reports the
  original total.

## Outcome

The bounded-query contract is documented and the ceiling is test-covered. The
`truncated` field is part of the `/graph/query` response shape (null in the
non-truncated case).

## Notes

DEVIATION: the assertion landed as a `query.rs` unit test rather than a live
`conformance.rs` HTTP test, for two reasons: the conformance fixture is tiny
(well under the 5000-node ceiling, so a live request cannot exercise truncation
without generating a large fixture, which would slow the suite), and
`conformance.rs` is under heavy concurrent edit by the parallel agent. The unit
test exercises the exact bounding logic directly. A live conformance assertion
over a large fixture is a low-risk follow-up once the file settles.
