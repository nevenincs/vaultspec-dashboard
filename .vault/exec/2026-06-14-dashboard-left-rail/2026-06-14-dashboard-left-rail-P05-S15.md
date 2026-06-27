---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Prove per-scope mode and filter reset with no cross-scope bleed

## Scope

- `frontend/src/stores/__adversarial__/`

## Description

- Add `isolation-05-browser-mode-filter-cross-scope-bleed.test`: prove the per-scope mode and filter reset on both `setScope` (worktree swap) and `swapWorkspace` (workspace swap), extending the 022 cross-scope-bleed class to the new per-scope rail state.

## Outcome

Per-scope mode and filter reset is proven with no cross-scope bleed across both worktree and workspace swaps; committed and green.

## Notes

This is the extension the ADR mandates: the existing isolation tests guarded scope swaps; this adds the new per-scope rail state.
