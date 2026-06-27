---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S09'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Mirror the live /nodes/{id}/content shape exactly in the mock engine and feed a captured live sample through the adapter in a fidelity test

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Add the content route to the mock engine, serving the exact live field set flat-with-tiers, with the same extension-to-language-hint mapping the engine uses and the same id-resolution and error splits (malformed/non-content 400, unknown stem 404, structural degradation on an unreadable worktree).
- Add a mock-fidelity test feeding a captured mock sample through the real `adaptContent` adapter and asserting the field set, the doc/code resolution, the structural degradation, and the 404/400 splits.

## Outcome

The mock mirrors the live shape and the adapter is exercised against it; 22 mock-engine tests pass, including the three new content tests.

## Notes

None.
