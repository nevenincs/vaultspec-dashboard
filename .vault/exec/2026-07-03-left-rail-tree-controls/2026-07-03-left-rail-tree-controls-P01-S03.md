---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S03'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Adapt the new `size` field tolerantly (+ `VaultTreeEntry` in `engine.ts`): validate non-negative integers, drop malformed, absent stays absent

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add `normalizeVaultTreeSize` to `frontend/src/stores/server/liveAdapters.ts`: finite non-negative integers only, malformed dropped whole
- Extend `VaultTreeEntry` with optional `size` in `engine.ts`
- Extend the adapter fixture test with a valid and a malformed size vector

## Outcome

`liveAdapters.test.ts` 93/93 green.

## Notes

None.
