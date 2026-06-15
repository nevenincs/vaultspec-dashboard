---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Add fixture-document tests covering all four extractors and the three resolution states

## Scope

- `engine/crates/ingest-struct/tests/`

## Description

- Add the in-module fixture test covering all four extractors and all three resolution states in one document (nine mentions, broken retained).
- Add the integration pipeline test (reader to extractors to resolver) under the crate's tests directory per the plan caption.

## Outcome

Eight tests across the crate; the pipeline is exercised end to end against fixture trees.

## Notes

None.
