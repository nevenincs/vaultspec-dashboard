---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:9fa5ccc4cf48037bdcbcc8d4ef05ea5a29ba4bb11b9183fa033c007ff06bbb33'
step_id: 'S11'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Report semantic embedding first-scroll timing

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Add `semantic_timing` to `/graph/embeddings` success and degradation payloads.
- Report semantic epoch read time, vector cache hit status, and vector scroll time.
- Preserve existing semantic-tier degradation behavior when rag discovery or vector
  scroll fails.

## Outcome

The embedding route now distinguishes warm-cache reads from first-scroll cost in the
wire response without changing node, edge, generation, or tier semantics.

## Notes

Verification:

- `cargo test -p vaultspec-api`
- Live frontend backend suite: 8 files, 80 tests
