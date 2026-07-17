---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---

# Rewrite the conflicts guard onto the shared predicate (delete its local specificityRank) and add settings-control cases: empty presentations for the ten previously-flagged stock rows, plus a synthetic same-specificity override collision that still warns (D2)

## Scope

- `frontend/src/stores/view/defaultKeybindingConflicts.guard.test.ts`
- `frontend/src/stores/view/settingsControls.test.ts`

## Description

- Rewrite the default-conflicts guard onto the shared predicate (local specificityRank deleted); assert empty recorder presentations for all ten previously-flagged stock rows and a still-warning synthetic same-specificity override collision.

## Outcome

Guard and recorder now consume one predicate (ADR D2). Recorder assertions live in the guard file beside the default-set assembly (executor discretion, flagged).

## Notes
