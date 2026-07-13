---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Add engine tests for success, byte-cap truncation, traversal 400, and structural degradation

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Add engine integration tests: a doc and a code file served with the full payload and tiers; byte-cap truncation with the honest truncated block; a path-traversal tiered 400; structural degradation on an unreadable path; an unknown-stem 404 and a non-content-node 400.
- Add unit tests for id-to-path resolution, the traversal guard, the language-hint mapping, and codepoint-safe truncation.

## Outcome

All twelve content tests pass. The route's success, bounding, traversal, and degradation contracts are proven; the engine fmt and clippy gate is clean.

## Notes

None.
