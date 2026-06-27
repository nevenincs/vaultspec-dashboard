---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S15'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Bound live search sibling latency

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Add a search-specific sibling subprocess timeout for the `/search` route.
- Route search through `run_sibling_bounded` with the shorter interactive budget.
- Preserve existing degraded semantic-tier behavior when rag search times out.

## Outcome

The live conformance search test no longer times out at Vitest's 15 second limit. A
slow or hung rag search now returns the existing empty-results degraded envelope inside
the interactive route budget.

## Notes

Verification:

- `cargo test -p vaultspec-api`
- `node node_modules/vitest/vitest.mjs run src/testing/engineConformance.test.ts`
- Full live backend frontend set: 8 files, 79 tests
